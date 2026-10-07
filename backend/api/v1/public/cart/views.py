"""Server-side carts for anonymous visitors.

A guest cart is an ordinary pending SalesOrder with no customer, addressed by
a random bearer token sent in the `X-Guest-Cart-Token` header (never the URL,
which lands in logs and referrers). Line edits reuse the customer cart's
services and serializers unchanged.
"""

from __future__ import annotations

from typing import ClassVar

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.customer.orders.serializers import (
    AddLineSerializer,
    CartContactResponseSerializer,
    CartContactSerializer,
    SalesOrderSerializer,
    UpdateLineSerializer,
)
from apps.catalog.selectors.products import get_variant_by_id
from apps.common.exceptions import DomainError
from apps.common.responses import error_from_exception, error_response, not_found
from apps.common.throttling import GuestCheckoutRateThrottle, PublicReadRateThrottle
from apps.common.utils.codes import hash_code
from apps.orders.models import SalesOrder
from apps.orders.selectors.sales_orders import get_guest_cart, get_order_line_by_id
from apps.orders.services.carts import (
    add_line,
    create_guest_cart,
    remove_line,
    set_cart_contact_phone,
    update_line,
)
from apps.orders.services.orders import lock_order

GUEST_CART_TOKEN_HEADER = "X-Guest-Cart-Token"  # noqa: S105 -- a header name, not a secret

TOKEN_PARAMETER = OpenApiParameter(
    name=GUEST_CART_TOKEN_HEADER,
    location=OpenApiParameter.HEADER,
    required=True,
    description="The token returned once by POST /public/cart/.",
)


def guest_cart_token(request) -> str:
    return (request.headers.get(GUEST_CART_TOKEN_HEADER) or "").strip()


def resolve_guest_cart(request):
    """(cart, None), or (None, an error response) for a missing or unknown
    token. An unknown token, someone else's, and a checked-out cart's all
    look the same: not found."""
    token = guest_cart_token(request)
    if not token:
        return None, error_response(
            "guest_cart_token_required",
            f"Send the guest cart token in the {GUEST_CART_TOKEN_HEADER} header.",
            status=status.HTTP_400_BAD_REQUEST,
        )
    cart = get_guest_cart(token)
    if cart is None:
        return None, not_found("guest_cart_not_found", "Cart not found.")
    return cart, None


def lock_guest_cart(request):
    """`resolve_guest_cart` for a mutation: call inside a transaction. The cart
    row is locked (and refreshed) before any line is read or written, so two
    edits to one cart run one after the other — two adds of the same variant
    merge into one line instead of each creating it. Everything the lookup
    relied on is checked again under the lock, since a checkout may have
    claimed the cart while this request waited."""
    cart, error = resolve_guest_cart(request)
    if error:
        return None, error
    lock_order(cart)
    still_open = (
        cart.status == SalesOrder.Status.PENDING
        and cart.customer_id is None
        and cart.deleted_at is None
        and cart.guest_token_hash == hash_code(guest_cart_token(request))
    )
    if not still_open:
        return None, not_found("guest_cart_not_found", "Cart not found.")
    return cart, None


def _cart_response(cart, *, status_code=status.HTTP_200_OK) -> Response:
    return Response(
        {"data": SalesOrderSerializer(cart).data, "message": "Success"}, status=status_code
    )


class GuestCartAPIMixin:
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]
    permission_classes: ClassVar[list] = [AllowAny]


@extend_schema(tags=["Public Cart"])
class GuestCartView(GuestCartAPIMixin, APIView):
    serializer_class = SalesOrderSerializer

    def get_throttles(self):
        # Creating a cart writes a row, so it shares checkout's tighter rate.
        if self.request.method == "POST":
            return [GuestCheckoutRateThrottle()]
        return super().get_throttles()

    def post(self, request) -> Response:
        """Start an empty guest cart. The token is returned only here."""
        cart, token = create_guest_cart()
        data = {"token": token, "cart": SalesOrderSerializer(cart).data}
        return Response({"data": data, "message": "Success"}, status=status.HTTP_201_CREATED)

    @extend_schema(parameters=[TOKEN_PARAMETER])
    def get(self, request) -> Response:
        cart, error = resolve_guest_cart(request)
        return error or _cart_response(cart)


@extend_schema(
    tags=["Public Cart"], parameters=[TOKEN_PARAMETER], responses=CartContactResponseSerializer
)
class GuestCartContactView(GuestCartAPIMixin, APIView):
    """Save the phone typed at checkout on the guest's own open cart, so it
    is kept if they leave before placing the order."""

    serializer_class = CartContactSerializer

    @transaction.atomic
    def patch(self, request) -> Response:
        cart, error = lock_guest_cart(request)
        if error:
            return error
        serializer = CartContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            set_cart_contact_phone(cart=cart, phone=serializer.validated_data["phone"])
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": CartContactResponseSerializer(cart).data, "message": "Success"})


@extend_schema(tags=["Public Cart"], parameters=[TOKEN_PARAMETER])
class GuestCartLineListCreateView(GuestCartAPIMixin, APIView):
    serializer_class = AddLineSerializer

    @transaction.atomic
    def post(self, request) -> Response:
        cart, error = lock_guest_cart(request)
        if error:
            return error
        serializer = AddLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        variant = get_variant_by_id(data.pop("variant_id"))
        if variant is None:
            return error_from_exception(DomainError("Variant not found.", code="variant_not_found"))
        try:
            add_line(order=cart, variant=variant, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        cart.refresh_from_db()
        return _cart_response(cart, status_code=status.HTTP_201_CREATED)


@extend_schema(tags=["Public Cart"], parameters=[TOKEN_PARAMETER])
class GuestCartLineDetailView(GuestCartAPIMixin, APIView):
    serializer_class = UpdateLineSerializer

    def _own_line(self, request, line_id):
        cart, error = lock_guest_cart(request)
        if error:
            return None, None, error
        # Read only now, under the cart's lock: a line fetched earlier could
        # have been removed or merged meanwhile. Another cart's line looks
        # exactly like a missing one.
        line = get_order_line_by_id(line_id)
        if line is None or line.order_id != cart.id:
            return None, None, not_found("order_line_not_found", "Order line not found.")
        return cart, line, None

    @transaction.atomic
    def patch(self, request, line_id) -> Response:
        cart, line, error = self._own_line(request, line_id)
        if error:
            return error
        serializer = UpdateLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            update_line(line=line, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        cart.refresh_from_db()
        return _cart_response(cart)

    @transaction.atomic
    def delete(self, request, line_id) -> Response:
        cart, line, error = self._own_line(request, line_id)
        if error:
            return error
        try:
            remove_line(line=line)
        except DomainError as exc:
            return error_from_exception(exc)
        cart.refresh_from_db()
        return _cart_response(cart)
