from __future__ import annotations

from typing import ClassVar

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import DomainError
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
from apps.logistics.services.rates import shipping_options, try_quote_shipping
from apps.orders.services.coupons import preview_coupon
from apps.orders.services.guest_checkout import guest_checkout, subtotal_for_items, weight_for_items

from .serializers import (
    GuestCheckoutSerializer,
    GuestCouponValidationSerializer,
    GuestOrderSerializer,
    GuestShippingLocationSerializer,
    GuestShippingQuoteRequestSerializer,
)


@extend_schema(tags=["Public Checkout"])
class GuestCheckoutView(APIView):
    serializer_class = GuestCheckoutSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [GuestCheckoutRateThrottle]

    def post(self, request) -> Response:
        serializer = GuestCheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)

        try:
            order = guest_checkout(**data)
        except DomainError as exc:
            return error_from_exception(exc)

        return Response(
            {"data": GuestOrderSerializer(order).data, "message": "Success"},
            status=status.HTTP_201_CREATED,
        )


def _resolve_zone_for_guest(*, zone_id, address_text):
    """Guest counterpart of the customer cart's `_resolve_zone` — there is no
    address book to look an id up against, only typed text or an explicit
    zone id. An explicit zone_id still wins outright over any text given."""
    if zone_id:
        zone = get_zone_by_id(zone_id)
        if zone is None:
            return None, not_found("zone_not_found", "Delivery zone not found.")
        return zone, None
    zone = find_zone_by_address_text(address_text)
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

        zone, error = _resolve_zone_for_guest(
            zone_id=data.get("zone_id"), address_text=data.get("address_text")
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
        except DomainError as exc:
            return error_from_exception(exc)
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


@extend_schema(tags=["Public Checkout"])
class ShippingOptionListView(APIView):
    serializer_class = GuestShippingLocationSerializer
    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def post(self, request) -> Response:
        serializer = GuestShippingLocationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        zone, error = _resolve_zone_for_guest(
            zone_id=data.get("zone_id"), address_text=data.get("address_text")
        )
        if error is not None:
            return error

        try:
            weight = weight_for_items(data["items"])
        except DomainError as exc:
            return error_from_exception(exc)

        from api.v1.customer.orders.serializers import ShippingOptionSerializer

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


@extend_schema(tags=["Public Checkout"])
class ShippingZoneListView(APIView):
    """Lists the delivery zones a guest can pick from directly — same
    keyword-free payload as the customer cart's zone list."""

    permission_classes: ClassVar[list] = [AllowAny]
    throttle_classes: ClassVar[list] = [PublicReadRateThrottle]

    def get(self, request) -> Response:
        from api.v1.customer.orders.serializers import ShippingZoneOptionSerializer

        zones = zones_list()
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
            subtotal = subtotal_for_items(data["items"])
            result = preview_coupon(code=data["code"], subtotal=subtotal)
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