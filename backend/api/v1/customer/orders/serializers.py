from __future__ import annotations

from rest_framework import serializers

from apps.orders.models import ReturnRMA, ReturnRMALine, SalesOrder, Shipment


class SalesOrderLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    quantity = serializers.IntegerField()
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    is_preorder = serializers.BooleanField(read_only=True)


class CustomerShipmentSerializer(serializers.Serializer):
    """Hand-listed like ShippingOptionSerializer: the admin shipment serializer
    exposes cod_amount/courier_status, which a customer-facing tracking view
    must not leak."""

    id = serializers.UUIDField(read_only=True)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, allow_null=True)
    tracking_number = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(choices=Shipment.Status.choices, read_only=True)
    shipped_at = serializers.DateTimeField(read_only=True, allow_null=True)
    delivered_at = serializers.DateTimeField(read_only=True, allow_null=True)


class SalesOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_number = serializers.CharField(read_only=True)
    status = serializers.ChoiceField(choices=SalesOrder.Status.choices)
    shipping_address_id = serializers.UUIDField(read_only=True, allow_null=True)
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2)
    tax_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    shipping_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    discount_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    grand_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    coupon_code = serializers.CharField(source="coupon.code", read_only=True, allow_null=True)
    lines = serializers.SerializerMethodField()
    shipments = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return SalesOrderLineSerializer(obj.lines.all(), many=True).data

    def get_shipments(self, obj) -> list[dict]:
        return CustomerShipmentSerializer(obj.shipments.all(), many=True).data


class OrderHistoryLineSerializer(SalesOrderLineSerializer):
    """A line as the order history shows it: what was bought, by name, so the
    storefront can list and link the items without a catalogue lookup per
    line. Kept off the base serializer, which carts and checkout also return
    and which must not load a product per line."""

    product_id = serializers.UUIDField(source="variant.product_id", read_only=True)
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_slug = serializers.CharField(source="variant.product.slug", read_only=True)
    sku = serializers.CharField(source="variant.sku", read_only=True)
    color = serializers.CharField(source="variant.color", read_only=True)
    size = serializers.CharField(source="variant.size", read_only=True)


class OrderHistorySerializer(SalesOrderSerializer):
    """A placed order in the customer's history. Pair it with
    `orders_for_customer`, which prefetches each line's variant and product."""

    created_at = serializers.DateTimeField(read_only=True)

    def get_lines(self, obj) -> list[dict]:
        return OrderHistoryLineSerializer(obj.lines.all(), many=True).data


class AddLineSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class UpdateLineSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class CartContactSerializer(serializers.Serializer):
    """The phone typed at checkout, saved on the cart before it is placed.
    Checked as a Bangladeshi mobile number by `set_cart_contact_phone`."""

    phone = serializers.CharField(max_length=32)


class CartContactResponseSerializer(serializers.Serializer):
    contact_phone = serializers.CharField(read_only=True)


class ApplyCouponSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=32)


class CheckoutSerializer(serializers.Serializer):
    shipping_address_id = serializers.UUIDField(required=False, allow_null=True)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)


class ShippingQuoteRequestSerializer(serializers.Serializer):
    address_id = serializers.UUIDField(required=False, allow_null=True)
    address_text = serializers.CharField(required=False, allow_blank=True)
    zone_id = serializers.UUIDField(required=False, allow_null=True)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)

    def validate(self, attrs):
        if not (attrs.get("address_id") or attrs.get("address_text") or attrs.get("zone_id")):
            raise serializers.ValidationError(
                "Provide either address_id, address_text, or zone_id."
            )
        return attrs


class ShippingOptionSerializer(serializers.Serializer):
    """Deliberately hand-listed and never built from the Carrier model: the
    admin serializer's neighbours hold api_key/api_secret/webhook_secret."""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)
    cost = serializers.DecimalField(max_digits=10, decimal_places=2, allow_null=True)


class ShippingZoneOptionSerializer(serializers.Serializer):
    """Hand-listed like ShippingOptionSerializer: the admin zone serializer
    exposes country_codes (the address-matching keyword list), which a
    customer-facing zone picker must not leak."""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField(read_only=True)


class RMALineInputSerializer(serializers.Serializer):
    order_line_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class CreateRMASerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    lines = RMALineInputSerializer(many=True)


class RMALineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_line_id = serializers.UUIDField(read_only=True)
    quantity = serializers.IntegerField()
    condition = serializers.ChoiceField(choices=ReturnRMALine.Condition.choices, allow_blank=True)


class RMASerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    rma_number = serializers.CharField(read_only=True)
    order_id = serializers.UUIDField(read_only=True)
    status = serializers.ChoiceField(choices=ReturnRMA.Status.choices)
    reason = serializers.CharField(allow_blank=True)
    lines = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return RMALineSerializer(obj.lines.all(), many=True).data
