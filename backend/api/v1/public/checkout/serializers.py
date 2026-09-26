from __future__ import annotations

from rest_framework import serializers

from apps.orders.constants import PaymentMethodKey
from apps.orders.models import SalesOrder


class GuestCheckoutItemSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class GuestCheckoutAddressSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=150)
    phone = serializers.CharField(max_length=32)
    line1 = serializers.CharField(max_length=255)
    line2 = serializers.CharField(max_length=255, allow_blank=True, required=False)
    city = serializers.CharField(max_length=100, allow_blank=True, required=False)
    state = serializers.CharField(max_length=100, allow_blank=True, required=False)
    postal_code = serializers.CharField(max_length=32)
    country = serializers.CharField(max_length=100, default="Bangladesh")


class GuestCheckoutSerializer(serializers.Serializer):
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=32)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    items = GuestCheckoutItemSerializer(many=True)
    shipping_address = GuestCheckoutAddressSerializer()
    payment_method = serializers.ChoiceField(choices=PaymentMethodKey.choices)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)
    coupon_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    notes = serializers.CharField(allow_blank=True, required=False)


class GuestOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_number = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(choices=SalesOrder.Status.choices)
    contact_email = serializers.EmailField(read_only=True)
    contact_phone = serializers.CharField(read_only=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2)
    tax_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    shipping_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    discount_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    grand_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    coupon_code = serializers.CharField(source="coupon.code", read_only=True, allow_null=True)
    lines = serializers.SerializerMethodField()
    shipments = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        from api.v1.customer.orders.serializers import SalesOrderLineSerializer
        return SalesOrderLineSerializer(obj.lines.all(), many=True).data

    def get_shipments(self, obj) -> list[dict]:
        from api.v1.customer.orders.serializers import CustomerShipmentSerializer
        return CustomerShipmentSerializer(obj.shipments.all(), many=True).data


class GuestShippingLocationSerializer(serializers.Serializer):
    """A guest has no saved addresses, so — unlike the customer cart's
    shipping serializers — location is always either typed text or an
    explicit zone, never an address_id."""

    items = GuestCheckoutItemSerializer(many=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    zone_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if not (attrs.get("address_text") or attrs.get("zone_id")):
            raise serializers.ValidationError("Provide either address_text or zone_id.")
        return attrs


class GuestShippingQuoteRequestSerializer(GuestShippingLocationSerializer):
    carrier_id = serializers.UUIDField(required=False, allow_null=True)


class GuestCouponValidationSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)
    items = GuestCheckoutItemSerializer(many=True)