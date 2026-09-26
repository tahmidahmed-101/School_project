from __future__ import annotations

from rest_framework import serializers

from apps.catalog.selectors.images import variant_image_url
from apps.procurement.models import GoodsReceiptNote, GRNLine, PurchaseOrder, VendorBill


class SupplierSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    contact_email = serializers.EmailField(allow_blank=True)
    phone = serializers.CharField(allow_blank=True)
    payment_terms = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)


class SupplierCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    payment_terms = serializers.CharField(required=False, allow_blank=True)


class SupplierUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    contact_email = serializers.EmailField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    payment_terms = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)


class PurchaseOrderLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_image = serializers.SerializerMethodField()
    quantity_ordered = serializers.IntegerField()
    quantity_received = serializers.IntegerField()
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=4)

    def get_product_image(self, obj) -> str | None:
        return variant_image_url(obj.variant)


class PurchaseOrderLineInputSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity_ordered = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=4)


class PurchaseOrderSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    po_number = serializers.CharField(read_only=True)
    supplier_id = serializers.UUIDField(read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    status = serializers.ChoiceField(choices=PurchaseOrder.Status.choices)
    order_date = serializers.DateField()
    notes = serializers.CharField(allow_blank=True)
    lines = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return PurchaseOrderLineSerializer(obj.lines.all(), many=True).data


class PurchaseOrderCreateSerializer(serializers.Serializer):
    supplier_id = serializers.UUIDField()
    order_date = serializers.DateField()
    notes = serializers.CharField(required=False, allow_blank=True)
    lines = PurchaseOrderLineInputSerializer(many=True)


class PurchaseOrderLineUpdateSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField(required=False)
    quantity_ordered = serializers.IntegerField(min_value=1, required=False)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=4, required=False)


class PurchaseOrderUpdateSerializer(serializers.Serializer):
    supplier_id = serializers.UUIDField(required=False)
    order_date = serializers.DateField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)
    status = serializers.ChoiceField(choices=PurchaseOrder.Status.choices, required=False)


class GRNLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    purchase_order_line_id = serializers.UUIDField(read_only=True)
    quantity_received = serializers.IntegerField()
    condition = serializers.ChoiceField(choices=GRNLine.Condition.choices)


class GRNLineInputSerializer(serializers.Serializer):
    purchase_order_line_id = serializers.UUIDField()
    quantity_received = serializers.IntegerField(min_value=1)
    condition = serializers.ChoiceField(choices=GRNLine.Condition.choices)


class GoodsReceiptNoteSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    purchase_order_id = serializers.UUIDField(read_only=True)
    purchase_order_number = serializers.CharField(source="purchase_order.po_number", read_only=True)
    received_date = serializers.DateField()
    received_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    status = serializers.ChoiceField(choices=GoodsReceiptNote.Status.choices)
    lines = serializers.SerializerMethodField()

    def get_lines(self, obj) -> list[dict]:
        return GRNLineSerializer(obj.lines.all(), many=True).data


class GoodsReceiptCreateSerializer(serializers.Serializer):
    purchase_order_id = serializers.UUIDField()
    received_date = serializers.DateField()
    lines = GRNLineInputSerializer(many=True)


class VendorBillSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    bill_number = serializers.CharField(read_only=True)
    purchase_order_id = serializers.UUIDField(read_only=True)
    purchase_order_number = serializers.CharField(source="purchase_order.po_number", read_only=True)
    supplier_id = serializers.UUIDField(read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    due_date = serializers.DateField()
    status = serializers.ChoiceField(choices=VendorBill.Status.choices)
    payments = serializers.SerializerMethodField()

    def get_payments(self, obj) -> list[dict]:
        return VendorPaymentSerializer(obj.payments.all(), many=True).data


class VendorBillCreateSerializer(serializers.Serializer):
    purchase_order_id = serializers.UUIDField()
    supplier_id = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    due_date = serializers.DateField()


class VendorBillUpdateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2, required=False)
    due_date = serializers.DateField(required=False)


class VendorPaymentSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    vendor_bill_id = serializers.UUIDField(read_only=True)
    vendor_bill_number = serializers.CharField(source="vendor_bill.bill_number", read_only=True)
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    paid_at = serializers.DateTimeField()
    method = serializers.CharField(allow_blank=True)
    reference = serializers.CharField(allow_blank=True)


class VendorPaymentCreateSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    paid_at = serializers.DateTimeField()
    method = serializers.CharField(required=False, allow_blank=True)
    reference = serializers.CharField(required=False, allow_blank=True)
