from __future__ import annotations

from rest_framework import serializers

from apps.orders.constants import PaymentMethodKey
from apps.orders.models import SalesOrder


class GuestCheckoutItemSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class GuestCheckoutAddressSerializer(serializers.Serializer):
    # full_name/phone fall back to the checkout's own name and phone in
    # guest_checkout, so the form only has to ask for them once.
    full_name = serializers.CharField(max_length=150, required=False)
    phone = serializers.CharField(max_length=32, required=False)
    line1 = serializers.CharField(max_length=255)
    line2 = serializers.CharField(max_length=255, allow_blank=True, required=False)
    # District/City: required because the delivery zone (Inside/Outside Dhaka)
    # is matched against it.
    city = serializers.CharField(max_length=100)
    state = serializers.CharField(max_length=100, allow_blank=True, required=False)
    postal_code = serializers.CharField(max_length=32, allow_blank=True, required=False)
    country = serializers.CharField(max_length=100, default="Bangladesh")


class CheckoutTrackingSerializer(serializers.Serializer):
    fbp = serializers.CharField(max_length=128, allow_blank=True, required=False)
    fbc = serializers.CharField(max_length=256, allow_blank=True, required=False)
    ga_client_id = serializers.CharField(max_length=64, allow_blank=True, required=False)
    ttp = serializers.CharField(max_length=128, allow_blank=True, required=False)
    ttclid = serializers.CharField(max_length=256, allow_blank=True, required=False)
    utm_source = serializers.CharField(max_length=128, allow_blank=True, required=False)
    utm_medium = serializers.CharField(max_length=128, allow_blank=True, required=False)
    utm_campaign = serializers.CharField(max_length=256, allow_blank=True, required=False)
    utm_term = serializers.CharField(max_length=256, allow_blank=True, required=False)
    utm_content = serializers.CharField(max_length=256, allow_blank=True, required=False)
    source_url = serializers.URLField(max_length=500, allow_blank=True, required=False)


class GuestCheckoutSerializer(serializers.Serializer):
    # Optional: a phone-only guest is identified by the number instead.
    email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(max_length=32)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150, allow_blank=True, required=False)
    items = GuestCheckoutItemSerializer(many=True)
    shipping_address = GuestCheckoutAddressSerializer()
    payment_method = serializers.ChoiceField(choices=PaymentMethodKey.choices)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)
    coupon_code = serializers.CharField(max_length=32, required=False, allow_blank=True)
    notes = serializers.CharField(allow_blank=True, required=False)
    tracking = CheckoutTrackingSerializer(required=False)
    # Only ever grants consent; leaving it off never revokes an earlier opt-in.
    sms_marketing_opt_in = serializers.BooleanField(required=False, default=False)


class GuestCartCheckoutSerializer(GuestCheckoutSerializer):
    """Checkout of a saved guest cart: the cart supplies the items."""

    items = None


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
    """`phone` and `email` are optional: with them a guest's per-customer
    limit is checked here already, not only when the order is placed."""

    code = serializers.CharField(max_length=32)
    items = GuestCheckoutItemSerializer(many=True)
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)


class StorefrontCouponSerializer(serializers.Serializer):
    """Only what a shopper needs to decide whether a code is worth using —
    never the usage counters."""

    code = serializers.CharField(read_only=True)
    discount_type = serializers.CharField(read_only=True)
    value = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    min_order_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    max_discount_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, read_only=True, allow_null=True
    )
    starts_at = serializers.DateTimeField(read_only=True, allow_null=True)
    expires_at = serializers.DateTimeField(read_only=True, allow_null=True)
