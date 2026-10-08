from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.selectors.images import variant_image_url
from apps.orders.constants import PaymentMethodKey
from apps.orders.models import (
    Payment,
    PreorderStage,
    ReturnRMA,
    ReturnRMALine,
    SalesOrder,
    Shipment,
    StockReservation,
)
from apps.orders.selectors.payments import (
    order_balance_due,
    order_deposit_due,
    order_paid_total,
)
from apps.orders.selectors.shipments import attach_delivered_quantities
from apps.orders.services.address_snapshot import snapshot_or_live
from apps.orders.services.orders import allowed_status_overrides


class AdminSalesOrderLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.SerializerMethodField()
    product_name = serializers.SerializerMethodField()
    product_image = serializers.SerializerMethodField()
    quantity = serializers.IntegerField()
    shipped_quantity = serializers.IntegerField(read_only=True)
    # Units in DELIVERED consignments; set on the line by
    # `_orders_with_related` or `attach_delivered_quantities`.
    delivered_quantity = serializers.IntegerField(read_only=True)
    returned_quantity = serializers.IntegerField(read_only=True)
    shippable_quantity = serializers.IntegerField(read_only=True)
    awaiting_stock_quantity = serializers.IntegerField(read_only=True)
    returnable_quantity = serializers.IntegerField(read_only=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    tax_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    is_preorder = serializers.BooleanField(read_only=True)

    def get_variant_sku(self, obj) -> str:
        if obj.variant_sku:
            return obj.variant_sku
        return getattr(obj.variant, "sku", "") or ""

    def get_product_name(self, obj) -> str:
        if obj.product_name:
            return obj.product_name
        if obj.variant and getattr(obj.variant, "product", None):
            return obj.variant.product.name
        return ""

    def get_product_image(self, obj) -> str | None:
        return variant_image_url(obj.variant)


class PreorderStageEventSerializer(serializers.Serializer):
    stage = serializers.CharField(read_only=True)
    note = serializers.CharField(read_only=True)
    changed_by_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(read_only=True)

    def get_changed_by_name(self, obj) -> str | None:
        return obj.changed_by.get_full_name() if obj.changed_by else None


class AdminSalesOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_number = serializers.CharField(read_only=True)
    customer_id = serializers.UUIDField(read_only=True)
    customer_email = serializers.SerializerMethodField()
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    status = serializers.ChoiceField(choices=SalesOrder.Status.choices)
    shipping_address_id = serializers.UUIDField(read_only=True, allow_null=True)
    shipping_address = serializers.SerializerMethodField()
    notes = serializers.CharField(read_only=True, allow_blank=True)
    contact_email = serializers.CharField(read_only=True, allow_blank=True)
    contact_phone = serializers.CharField(read_only=True, allow_blank=True)
    contact_name = serializers.CharField(read_only=True, allow_blank=True)
    order_type = serializers.CharField(read_only=True)
    preorder_stage = serializers.CharField(read_only=True, allow_blank=True)
    preorder_stage_events = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2)
    tax_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    shipping_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    discount_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    grand_total = serializers.DecimalField(max_digits=14, decimal_places=2)
    paid_total = serializers.SerializerMethodField()
    balance_due = serializers.SerializerMethodField()
    deposit_due = serializers.SerializerMethodField()
    allowed_statuses = serializers.SerializerMethodField()
    coupon_code = serializers.CharField(source="coupon.code", read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    lines = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()
    shipments = serializers.SerializerMethodField()
    rmas = serializers.SerializerMethodField()

    def get_customer_email(self, obj) -> str:
        return obj.contact_email.strip() or getattr(obj.customer, "email", "") or ""

    def get_customer_name(self, obj) -> str:
        snapshot = snapshot_or_live(obj)
        if snapshot.get("full_name", "").strip():
            return snapshot["full_name"].strip()
        customer = obj.customer
        if customer is None:
            return ""
        full = f"{customer.first_name} {customer.last_name}".strip()
        return full or (customer.email or "").split("@")[0]

    def get_customer_phone(self, obj) -> str:
        # Order-level override first, then the ship-to, then the account.
        if obj.contact_phone.strip():
            return obj.contact_phone.strip()
        snapshot = snapshot_or_live(obj)
        if snapshot.get("phone", "").strip():
            return snapshot["phone"].strip()
        return getattr(obj.customer, "phone", "") or ""

    def get_shipping_address(self, obj) -> dict | None:
        # Reads the snapshot, so a ship-to corrected on the order — or one whose
        # saved address the customer has since deleted — still renders here and
        # matches what the invoice prints.
        snapshot = snapshot_or_live(obj)
        if not any(snapshot.values()):
            return None
        return {
            "id": obj.shipping_address_id,
            "full_name": snapshot.get("full_name", ""),
            "phone": snapshot.get("phone", ""),
            "line1": snapshot.get("line1", ""),
            "delivery_note": snapshot.get("line2", ""),
            "postal_code": snapshot.get("postal_code", ""),
            "country": snapshot.get("country", ""),
        }

    def get_lines(self, obj) -> list[dict]:
        lines = attach_delivered_quantities(list(obj.lines.all()))
        return AdminSalesOrderLineSerializer(lines, many=True).data

    def get_paid_total(self, obj) -> str:
        return str(order_paid_total(obj))

    def get_balance_due(self, obj) -> str:
        return str(order_balance_due(obj))

    def get_deposit_due(self, obj) -> str:
        return str(order_deposit_due(obj))

    def get_allowed_statuses(self, obj) -> list[str]:
        return allowed_status_overrides(obj)

    def get_preorder_stage_events(self, obj) -> list[dict]:
        return PreorderStageEventSerializer(obj.preorder_stage_events.all(), many=True).data

    def get_payments(self, obj) -> list[dict]:
        return AdminPaymentSerializer(obj.payments.all(), many=True).data

    def get_shipments(self, obj) -> list[dict]:
        return ShipmentSerializer(obj.shipments.all(), many=True).data

    def get_rmas(self, obj) -> list[dict]:
        return AdminRMASerializer(obj.rmas.all(), many=True).data


class AdminCartItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    product_name = serializers.CharField(read_only=True)
    sku = serializers.CharField(source="variant_sku", read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    unit_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_preorder = serializers.BooleanField(read_only=True)


class AdminCustomerCartSerializer(serializers.Serializer):
    """An open cart: who, what, and when they last touched it. An anonymous
    guest cart has no customer, so its customer fields are null and
    `is_guest_cart` is true; its access token is never exposed.
    `customer_phone` and `customer_name` are what was typed at checkout, else
    the customer's profile — so a guest cart has them only once captured.
    `reached_checkout` is true once a phone was typed there."""

    id = serializers.UUIDField(read_only=True)
    is_guest_cart = serializers.SerializerMethodField()
    customer_id = serializers.UUIDField(read_only=True, allow_null=True)
    # allow_null: through a missing customer DRF would otherwise drop the field.
    customer_email = serializers.EmailField(
        source="customer.email", read_only=True, allow_null=True
    )
    customer_name = serializers.SerializerMethodField()
    customer_phone = serializers.SerializerMethodField()
    reached_checkout = serializers.SerializerMethodField()
    order_type = serializers.SerializerMethodField()
    items = AdminCartItemSerializer(source="lines", many=True, read_only=True)
    item_count = serializers.SerializerMethodField()
    subtotal = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)

    def get_is_guest_cart(self, obj) -> bool:
        return obj.customer_id is None

    def get_order_type(self, obj) -> str:
        if any(line.is_preorder for line in obj.lines.all()):
            return SalesOrder.OrderType.PREORDER
        return SalesOrder.OrderType.STOCK

    def get_customer_name(self, obj) -> str | None:
        if obj.contact_name.strip():
            return obj.contact_name.strip()
        return obj.customer.get_full_name() if obj.customer else None

    def get_reached_checkout(self, obj) -> bool:
        return bool(obj.contact_phone.strip())

    def get_customer_phone(self, obj) -> str | None:
        # Both live on rows the list already loads: the cart and its customer.
        if obj.contact_phone.strip():
            return obj.contact_phone.strip()
        return obj.customer.phone if obj.customer else None

    def get_item_count(self, obj) -> int:
        return sum(line.quantity for line in obj.lines.all())


class AdminOrderCreateLineSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class AdminOrderCreateSerializer(serializers.Serializer):
    customer_id = serializers.UUIDField()
    shipping_address_id = serializers.UUIDField(required=False, allow_null=True)
    carrier_id = serializers.UUIDField(required=False, allow_null=True)
    lines = AdminOrderCreateLineSerializer(many=True, allow_empty=False)
    capture_payment = serializers.BooleanField(required=False, default=True)
    payment_method = serializers.ChoiceField(
        choices=PaymentMethodKey.choices, required=False, default=PaymentMethodKey.MANUAL
    )


# Ship-to keys as the API spells them, mapped to their `Address` field names.
SHIP_TO_API_FIELDS = {
    "full_name": "full_name",
    "phone": "phone",
    "line1": "line1",
    "delivery_note": "line2",
    "postal_code": "postal_code",
    "country": "country",
}


class AdminOrderUpdateSerializer(serializers.Serializer):
    """Correctable fields only. `status` is absent by design — it has its own
    endpoint so the cancel path can release stock."""

    shipping_address_id = serializers.UUIDField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    contact_phone = serializers.CharField(required=False, allow_blank=True)
    # Written onto the order's own snapshot, never the customer's address book.
    full_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    line1 = serializers.CharField(required=False, allow_blank=True)
    delivery_note = serializers.CharField(required=False, allow_blank=True)
    postal_code = serializers.CharField(required=False, allow_blank=True)
    country = serializers.CharField(required=False, allow_blank=True)


class AdminOrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=SalesOrder.Status.choices)


class AdminPreorderStageSerializer(serializers.Serializer):
    stage = serializers.ChoiceField(choices=PreorderStage.choices)
    note = serializers.CharField(max_length=255, required=False, allow_blank=True)


class AdminOrderLineUpdateSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)


class AdminOrderLineCreateSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class ShipmentLineInputSerializer(serializers.Serializer):
    order_line_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class CreateShipmentSerializer(serializers.Serializer):
    carrier_id = serializers.UUIDField(required=False, allow_null=True)
    tracking_number = serializers.CharField(required=False, allow_blank=True)
    shipping_charge = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    cod_amount = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    lines = ShipmentLineInputSerializer(many=True)


class ShipmentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_id = serializers.UUIDField(read_only=True)
    order_type = serializers.CharField(source="order.order_type", read_only=True)
    carrier_id = serializers.UUIDField(read_only=True, allow_null=True)
    carrier_name = serializers.CharField(source="carrier.name", read_only=True, allow_null=True)
    tracking_number = serializers.CharField(allow_blank=True)
    status = serializers.ChoiceField(choices=Shipment.Status.choices)
    shipping_charge = serializers.DecimalField(max_digits=12, decimal_places=2)
    cod_amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    courier_status = serializers.CharField(allow_blank=True)
    shipped_at = serializers.DateTimeField(allow_null=True)
    delivered_at = serializers.DateTimeField(allow_null=True)
    received_back_at = serializers.DateTimeField(read_only=True, allow_null=True)
    # Units written off as damaged at receive-back, and how many of them are
    # still owed (not yet replaced). Read from the prefetched lines (see
    # shipments_list / _orders_with_related).
    damaged_quantity = serializers.SerializerMethodField()
    unresolved_damaged_quantity = serializers.SerializerMethodField()

    def get_damaged_quantity(self, obj) -> int:
        return sum(line.damaged_quantity for line in obj.lines.all())

    def get_unresolved_damaged_quantity(self, obj) -> int:
        return sum(line.unresolved_damaged_quantity for line in obj.lines.all())


class ShipmentLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_line_id = serializers.UUIDField(read_only=True)
    sku = serializers.CharField(source="order_line.variant.sku", read_only=True)
    product_name = serializers.CharField(source="order_line.variant.product.name", read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    damaged_quantity = serializers.IntegerField(read_only=True)
    replaced_quantity = serializers.IntegerField(read_only=True)
    unresolved_damaged_quantity = serializers.IntegerField(read_only=True)


class ShipmentDetailSerializer(ShipmentSerializer):
    """A single shipment with its lines, for the detail page and the responses
    of actions taken from it (load with `get_shipment_detail`)."""

    lines = ShipmentLineSerializer(many=True, read_only=True)


class ShipmentReceiveBackLineSerializer(serializers.Serializer):
    shipment_line_id = serializers.UUIDField()
    sellable_quantity = serializers.IntegerField(min_value=0)
    damaged_quantity = serializers.IntegerField(min_value=0)


class ShipmentReceiveBackSerializer(serializers.Serializer):
    """One entry per shipment line; the two quantities must add up to what the
    line carried (checked by `receive_back_shipment`)."""

    lines = ShipmentReceiveBackLineSerializer(many=True, allow_empty=False)


class ShipmentStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=Shipment.Status.choices)


class AdminPaymentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_id = serializers.UUIDField(read_only=True)
    order_number = serializers.CharField(source="order.order_number", read_only=True)
    order_type = serializers.CharField(source="order.order_type", read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    refunded_amount = serializers.DecimalField(max_digits=14, decimal_places=2, read_only=True)
    method = serializers.ChoiceField(choices=PaymentMethodKey.choices)
    status = serializers.ChoiceField(choices=Payment.Status.choices)
    gateway_reference = serializers.CharField(allow_blank=True)


class StockReservationSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_line_id = serializers.UUIDField(read_only=True)
    order_id = serializers.UUIDField(source="order_line.order_id", read_only=True)
    order_number = serializers.CharField(source="order_line.order.order_number", read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    status = serializers.ChoiceField(choices=StockReservation.Status.choices, read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    expires_at = serializers.DateTimeField(read_only=True)
    is_expired = serializers.BooleanField(read_only=True)


class RefundPaymentSerializer(serializers.Serializer):
    """Omit `amount` to refund whatever is still outstanding."""

    amount = serializers.DecimalField(
        max_digits=14, decimal_places=2, required=False, min_value=Decimal("0.01")
    )


class RMALineInputSerializer(serializers.Serializer):
    order_line_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class CreateRMASerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)
    lines = RMALineInputSerializer(many=True, allow_empty=False)


class AdminRMALineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    order_line_id = serializers.UUIDField(read_only=True)
    quantity = serializers.IntegerField()
    condition = serializers.ChoiceField(choices=ReturnRMALine.Condition.choices, allow_blank=True)


class AdminRMASerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    rma_number = serializers.CharField(read_only=True)
    order_id = serializers.UUIDField(read_only=True)
    order_type = serializers.CharField(source="order.order_type", read_only=True)
    status = serializers.ChoiceField(choices=ReturnRMA.Status.choices)
    reason = serializers.CharField(allow_blank=True)
    lines = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return AdminRMALineSerializer(obj.lines.all(), many=True).data


class GradeRMALineSerializer(serializers.Serializer):
    condition = serializers.ChoiceField(choices=ReturnRMALine.Condition.choices)
