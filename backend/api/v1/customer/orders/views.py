from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.selectors.addresses import get_address_for_user
from apps.catalog.selectors.products import get_variant_by_id
from apps.common.exceptions import DomainError
from apps.common.generics import list_response
from apps.common.params import get_uuid
from apps.common.permissions import IsCustomer
from apps.common.responses import error_from_exception, not_found
from apps.common.serializers import CapturePaymentSerializer
from apps.common.throttling import CouponRateThrottle
from apps.logistics.selectors.rates import (
    address_zone_text,
    find_zone_by_address_text,
    get_carrier_by_id,
    get_zone_by_id,
    zones_list,
)
from apps.logistics.services.rates import shipping_options, try_quote_shipping
from apps.orders.models import SalesOrder, SalesOrderLine
from apps.orders.selectors.returns import get_rma_by_id, rmas_list
from apps.orders.selectors.sales_orders import (
    get_checked_out_order,
    get_order_by_id,
    orders_for_customer,
)
from apps.orders.services.carts import add_line, get_or_create_cart, remove_line, update_line
from apps.orders.services.checkout import checkout, order_weight
from apps.orders.services.coupons import apply_coupon, remove_coupon
from apps.orders.services.orders import cancel_order
from apps.orders.services.payments import capture_payment
from apps.orders.services.returns import create_rma

from .serializers import (
    AddLineSerializer,
    ApplyCouponSerializer,
    CheckoutSerializer,
    CreateRMASerializer,
    RMASerializer,
    SalesOrderSerializer,
    ShippingOptionSerializer,
    ShippingQuoteRequestSerializer,
    ShippingZoneOptionSerializer,
    UpdateLineSerializer,
)


def _own_order_or_404(request, order_id) -> SalesOrder | None:
    order = get_order_by_id(order_id)
    if order is None or order.customer_id != request.user.id:
        return None
    return order


def _own_line_or_404(request, line_id) -> SalesOrderLine | None:
    line = SalesOrderLine.objects.filter(id=line_id).select_related("order").first()
    if line is None or line.order.customer_id != request.user.id:
        return None
    return line


@extend_schema(tags=["Orders"])
class CartView(APIView):
    serializer_class = SalesOrderSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        cart = get_or_create_cart(request.user)
        return Response({"data": SalesOrderSerializer(cart).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class CartLineListCreateView(APIView):
    serializer_class = AddLineSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request) -> Response:
        cart = get_or_create_cart(request.user)
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
        return Response(
            {"data": SalesOrderSerializer(cart).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


@extend_schema(tags=["Orders"])
class CartLineDetailView(APIView):
    serializer_class = SalesOrderSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def patch(self, request, line_id) -> Response:
        line = _own_line_or_404(request, line_id)
        if line is None:
            return not_found("order_line_not_found", "Order line not found.")
        serializer = UpdateLineSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            update_line(line=line, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": SalesOrderSerializer(line.order).data, "message": "Success"})

    def delete(self, request, line_id) -> Response:
        line = _own_line_or_404(request, line_id)
        if line is None:
            return not_found("order_line_not_found", "Order line not found.")
        order = line.order
        try:
            remove_line(line=line)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": SalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class CartCouponView(APIView):
    serializer_class = ApplyCouponSerializer
    permission_classes: ClassVar[list] = [IsCustomer]
    throttle_classes: ClassVar[list] = [CouponRateThrottle]

    def post(self, request) -> Response:
        cart = get_or_create_cart(request.user)
        serializer = ApplyCouponSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            apply_coupon(order=cart, code=serializer.validated_data["code"], actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": SalesOrderSerializer(cart).data, "message": "Success"})

    def delete(self, request) -> Response:
        cart = get_or_create_cart(request.user)
        try:
            remove_coupon(order=cart, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": SalesOrderSerializer(cart).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class CheckoutView(APIView):
    serializer_class = CheckoutSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request) -> Response:
        cart = get_or_create_cart(request.user)
        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        address_id = serializer.validated_data.get("shipping_address_id")
        carrier_id = serializer.validated_data.get("carrier_id")

        shipping_address = None
        if address_id:
            shipping_address = get_address_for_user(request.user, address_id)
            if shipping_address is None:
                return error_from_exception(
                    DomainError("Address not found.", code="address_not_found")
                )

        carrier = None
        if carrier_id:
            carrier = get_carrier_by_id(carrier_id)
            if carrier is None:
                return error_from_exception(
                    DomainError("Carrier not found.", code="carrier_not_found")
                )

        try:
            order = checkout(order=cart, shipping_address=shipping_address, carrier=carrier)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response({"data": SalesOrderSerializer(order).data, "message": "Success"})


def _resolve_zone(request, address_id, raw_text, zone_id=None):
    """Returns (ShippingZone, error_response). `None, None` means neither an
    address, address text, nor zone id was given — callers decide how to report
    that. An explicit zone_id wins outright: the customer picked it, so no
    address-text guessing is needed or wanted. The address is looked up through
    the user's own queryset so someone else's address is a 404, never a 403."""
    if zone_id:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return None, not_found("zone_not_found", "Delivery zone not found.")
        return zone, None
    text = raw_text
    if address_id:
        address = get_address_for_user(request.user, address_id)
        if address is None:
            return None, not_found("address_not_found", "Address not found.")
        text = address_zone_text(address)
    if not text:
        return None, None
    zone = find_zone_by_address_text(text)
    if zone is None:
        return None, error_from_exception(
            DomainError("Delivery is not available for this address yet.", code="zone_not_found")
        )
    return zone, None


@extend_schema(tags=["Orders"])
class CartShippingQuoteView(APIView):
    serializer_class = ShippingQuoteRequestSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request) -> Response:
        serializer = ShippingQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        zone, error = _resolve_zone(
            request, data.get("address_id"), data.get("address_text"), data.get("zone_id")
        )
        if error is not None:
            return error
        if zone is None:
            return error_from_exception(
                DomainError(
                    "Provide either address_id, address_text, or zone_id.",
                    code="missing_address_text",
                )
            )

        carrier = None
        if data.get("carrier_id"):
            carrier = get_carrier_by_id(data["carrier_id"])
            if carrier is None:
                return not_found("carrier_not_found", "Carrier not found.")

        cart = get_or_create_cart(request.user)
        weight = order_weight(cart)
        quote = try_quote_shipping(zone=zone, weight=weight, carrier=carrier)
        return Response(
            {
                "data": {
                    "zone": zone.name,
                    "weight": str(weight),
                    "carrier_id": str(carrier.id) if carrier else None,
                    "shipping_total": str(quote) if quote is not None else None,
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Orders"])
class CartShippingOptionListView(APIView):
    serializer_class = ShippingOptionSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        params = request.query_params
        zone, error = _resolve_zone(
            request,
            get_uuid(params, "address_id"),
            params.get("address_text"),
            get_uuid(params, "zone_id"),
        )
        if error is not None:
            return error
        if zone is None:
            return error_from_exception(
                DomainError(
                    "Provide either address_id, address_text, or zone_id.",
                    code="missing_address_text",
                )
            )

        cart = get_or_create_cart(request.user)
        weight = order_weight(cart)
        options = [
            {"id": option["carrier"].id, "name": option["carrier"].name, "cost": option["cost"]}
            for option in shipping_options(zone=zone, weight=weight)
        ]
        return Response(
            {
                "data": {
                    "zone": zone.name,
                    "weight": str(weight),
                    "options": ShippingOptionSerializer(options, many=True).data,
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Orders"])
class CartShippingZoneListView(APIView):
    """Lists the delivery zones a customer can pick from directly, bypassing
    the address-text keyword match entirely — the customer's own tap is the
    source of truth for which rate applies, not a guess from free text."""

    serializer_class = ShippingZoneOptionSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        zones = zones_list()
        return Response(
            {"data": ShippingZoneOptionSerializer(zones, many=True).data, "message": "Success"}
        )


@extend_schema(tags=["Orders"])
class PaymentCaptureView(APIView):
    serializer_class = CapturePaymentSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request) -> Response:
        order = get_checked_out_order(request.user)
        if order is None:
            return error_from_exception(
                DomainError(
                    "No checked-out order is awaiting payment.", code="no_order_awaiting_payment"
                )
            )
        serializer = CapturePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            capture_payment(order=order, **serializer.validated_data)
        except DomainError as exc:
            return error_from_exception(exc)
        order.refresh_from_db()
        return Response({"data": SalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class OrderHistoryListView(APIView):
    serializer_class = SalesOrderSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request) -> Response:
        orders = orders_for_customer(request.user).exclude(status=SalesOrder.Status.PENDING)
        return list_response(request, orders, SalesOrderSerializer, view=self)


@extend_schema(tags=["Orders"])
class OrderDetailView(APIView):
    serializer_class = SalesOrderSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request, order_id) -> Response:
        order = _own_order_or_404(request, order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        return Response({"data": SalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class OrderCancelView(APIView):
    serializer_class = SalesOrderSerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def post(self, request, order_id) -> Response:
        order = _own_order_or_404(request, order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        try:
            cancel_order(order=order, actor=request.user)
        except DomainError as exc:
            return error_from_exception(exc)
        order.refresh_from_db()
        return Response({"data": SalesOrderSerializer(order).data, "message": "Success"})


@extend_schema(tags=["Orders"])
class RMAListCreateView(APIView):
    serializer_class = RMASerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request, order_id) -> Response:
        order = _own_order_or_404(request, order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        return list_response(request, rmas_list(order=order), RMASerializer, view=self)

    def post(self, request, order_id) -> Response:
        order = _own_order_or_404(request, order_id)
        if order is None:
            return not_found("order_not_found", "Order not found.")
        serializer = CreateRMASerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        order_lines_by_id = {str(line.id): line for line in order.lines.all()}
        lines = []
        for line in data.pop("lines"):
            order_line = order_lines_by_id.get(str(line["order_line_id"]))
            if order_line is None:
                return error_from_exception(
                    DomainError("Order line not found.", code="order_line_not_found")
                )
            lines.append({"order_line": order_line, "quantity": line["quantity"]})

        try:
            rma = create_rma(order=order, lines=lines, **data)
        except DomainError as exc:
            return error_from_exception(exc)
        return Response(
            {"data": RMASerializer(rma).data, "message": "Success"}, status=status.HTTP_201_CREATED
        )


@extend_schema(tags=["Orders"])
class RMADetailView(APIView):
    serializer_class = RMASerializer
    permission_classes: ClassVar[list] = [IsCustomer]

    def get(self, request, rma_id) -> Response:
        rma = get_rma_by_id(rma_id)
        if rma is None or rma.order.customer_id != request.user.id:
            return not_found("rma_not_found", "RMA not found.")
        return Response({"data": RMASerializer(rma).data, "message": "Success"})
