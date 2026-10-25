from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from api.v1.public.cart.views import guest_cart_token, resolve_guest_cart
from apps.common.exceptions import DomainError
from apps.common.params import KIND_STOCK, get_kind
from apps.common.responses import error_from_exception, not_found
from apps.common.throttling import (
    CouponRateThrottle,
    GuestCheckoutRateThrottle,
    PublicReadRateThrottle,
)
from apps.logistics.selectors.rates import (
    find_zone_by_address_text,
    get_carrier_by_id,
    get_zone_by_id,
    zones_list,
)
from apps.logistics.services.rates import (
    is_free_delivery,
    shipping_options,
    try_quote_shipping,
)
from apps.marketing.services.sms_subscribers import sms_opt_in
from apps.orders.selectors.basket_kind import kind_for_items
from apps.orders.selectors.coupons import storefront_coupons
from apps.orders.services.coupons import preview_coupon
from apps.orders.services.guest_checkout import (
    guest_checkout,
    items_hold_preorder,
    priced_lines_for_items,
    subtotal_for_items,
    weight_for_items,
)
from apps.risk.request_ip import client_ip

from .serializers import (
    GuestCartCheckoutSerializer,
    GuestCheckoutSerializer,
    GuestCouponValidationSerializer,
    GuestOrderSerializer,
    GuestShippingLocationSerializer,
    GuestShippingQuoteRequestSerializer,
    StorefrontCouponSerializer,
)


@extend_schema(tags=["Public Checkout"])
class GuestCheckoutView(APIView):
    serializer_class = GuestCheckoutSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [GuestCheckoutRateThrottle]

    def post(self, request) -> Response:
        # With a guest-cart token, the saved cart is checked out; without
        # one, the request's own item list is, exactly as before.
        cart = None
        if guest_cart_token(request):
            cart, error = resolve_guest_cart(request)
            if error:
                return error
        serializer_class = GuestCartCheckoutSerializer if cart else GuestCheckoutSerializer
        serializer = serializer_class(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        sms_opt_in_wanted = data.pop("sms_marketing_opt_in", False)
        if cart is not None:
            data["cart"] = cart

        # AllowAny: a signed-in customer's order belongs to them; an anonymous
        # one goes to a guest identity, whatever email or phone was typed.
        customer = request.user if request.user.is_authenticated else None
        try:
            order = guest_checkout(**data, ip_address=client_ip(request), customer=customer)
        except DomainError as exc:
            return error_from_exception(exc)
        if sms_opt_in_wanted:
            sms_opt_in(phone=data["phone"])

        return Response(
            {"data": GuestOrderSerializer(order).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


def _resolve_zone_for_guest(*, zone_id, address_text, kind):
    """Guest counterpart of the customer cart's `_resolve_zone` — there is no
    address book to look an id up against, only typed text or an explicit
    zone id. An explicit zone_id still wins outright over any text given.
    Only zones of the basket's own kind are looked at."""
    if zone_id:
        zone = get_zone_by_id(zone_id, kind=kind)
        if zone is None:
            return None, not_found("zone_not_found", "Delivery zone not found.")
        return zone, None
    zone = find_zone_by_address_text(address_text, kind=kind)
    if zone is None:
        return None, error_from_exception(
            DomainError("Delivery is not available for this address yet.", code="zone_not_found")
        )
    return zone, None


@extend_schema(tags=["Public Checkout"])
class ShippingQuoteView(APIView):
    """Public equivalent of the customer cart's shipping-quote endpoint, for
    pricing delivery before a guest has an account or a persisted cart."""

    serializer_class = GuestShippingQuoteRequestSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def post(self, request) -> Response:
        serializer = GuestShippingQuoteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            kind = kind_for_items(data["items"])
        except DomainError as exc:
            return error_from_exception(exc)
        zone, error = _resolve_zone_for_guest(
            zone_id=data.get("zone_id"), address_text=data.get("address_text"), kind=kind
        )
        if error is not None:
            return error

        carrier = None
        if data.get("carrier_id"):
            carrier = get_carrier_by_id(data["carrier_id"])
            if carrier is None:
                return not_found("carrier_not_found", "Carrier not found.")

        try:
            weight = weight_for_items(data["items"])
            subtotal = subtotal_for_items(data["items"])
        except DomainError as exc:
            return error_from_exception(exc)
        quote = try_quote_shipping(
            zone=zone, weight=weight, kind=kind, carrier=carrier, subtotal=subtotal
        )
        return Response(
            {
                "data": {
                    "zone": zone.name,
                    "weight": str(weight),
                    "carrier_id": str(carrier.id) if carrier else None,
                    "shipping_total": str(quote) if quote is not None else None,
                    "free_delivery": is_free_delivery(kind=kind, subtotal=subtotal),
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Checkout"])
class ShippingOptionListView(APIView):
    serializer_class = GuestShippingLocationSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def post(self, request) -> Response:
        serializer = GuestShippingLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            kind = kind_for_items(data["items"])
        except DomainError as exc:
            return error_from_exception(exc)
        zone, error = _resolve_zone_for_guest(
            zone_id=data.get("zone_id"), address_text=data.get("address_text"), kind=kind
        )
        if error is not None:
            return error

        try:
            weight = weight_for_items(data["items"])
            subtotal = subtotal_for_items(data["items"])
        except DomainError as exc:
            return error_from_exception(exc)

        from api.v1.customer.orders.serializers import ShippingOptionSerializer

        options = [
            {"id": option["carrier"].id, "name": option["carrier"].name, "cost": option["cost"]}
            for option in shipping_options(
                zone=zone, weight=weight, kind=kind, subtotal=subtotal
            )
        ]
        return Response(
            {
                "data": {
                    "zone": zone.name,
                    "weight": str(weight),
                    "free_delivery": is_free_delivery(kind=kind, subtotal=subtotal),
                    "options": ShippingOptionSerializer(options, many=True).data,
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Checkout"])
class ShippingZoneListView(APIView):
    """Lists the delivery zones a guest can pick from directly — same
    keyword-free payload as the customer cart's zone list. `kind` picks the
    half; a quote still reads the kind from the basket itself."""

    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        from api.v1.customer.orders.serializers import ShippingZoneOptionSerializer

        zones = zones_list(kind=get_kind(request.query_params) or KIND_STOCK)
        return Response(
            {"data": ShippingZoneOptionSerializer(zones, many=True).data, "message": "Success"}
        )


@extend_schema(tags=["Public Checkout"])
class CouponValidationView(APIView):
    """Lets the storefront check a coupon code against the items in a guest's
    local cart before it submits the whole checkout form — so a bad code
    surfaces as an inline message instead of failing the entire submission."""

    serializer_class = GuestCouponValidationSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [CouponRateThrottle]

    def post(self, request) -> Response:
        serializer = GuestCouponValidationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            priced_lines = priced_lines_for_items(data["items"])
            subtotal = sum((amount for _product, amount in priced_lines), Decimal("0"))
            result = preview_coupon(
                code=data["code"],
                subtotal=subtotal,
                holds_preorder=items_hold_preorder(data["items"]),
                priced_lines=priced_lines,
                customer=request.user if request.user.is_authenticated else None,
                phone=data.get("phone", ""),
                email=data.get("email", ""),
            )
        except DomainError as exc:
            return error_from_exception(exc)

        return Response(
            {
                "data": {
                    "code": result["code"],
                    "discount_type": result["discount_type"],
                    "value": str(result["value"]),
                    "discount_amount": str(result["discount_amount"]),
                    "subtotal": str(subtotal),
                },
                "message": "Success",
            }
        )


@extend_schema(tags=["Public Checkout"])
class StorefrontCouponListView(APIView):
    """The coupons staff chose to advertise, for the storefront's voucher
    strip. A coupon not flagged `show_on_storefront` is never listed here."""

    serializer_class = StorefrontCouponSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        return Response(
            {
                "data": StorefrontCouponSerializer(storefront_coupons(), many=True).data,
                "message": "Success",
            }
        )
