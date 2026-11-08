from __future__ import annotations

from rest_framework import serializers

from api.v1.admin.catalog.fields import VariantTitleField
from apps.catalog.selectors.images import variant_image_url
from apps.common.params import KIND_STOCK, KINDS
from apps.inventory.constants import MovementType


class WarehouseSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    code = serializers.CharField()
    kind = serializers.CharField(read_only=True)
    address = serializers.CharField(allow_blank=True)
    is_active = serializers.BooleanField()
    is_default = serializers.BooleanField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)


class WarehouseCreateSerializer(serializers.Serializer):
    name = serializers.CharField()
    code = serializers.CharField()
    kind = serializers.ChoiceField(choices=KINDS, required=False, default=KIND_STOCK)
    address = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    is_default = serializers.BooleanField(required=False, default=False)


class WarehouseUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(required=False)
    code = serializers.CharField(required=False)
    address = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    is_default = serializers.BooleanField(required=False)


class StockItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    variant_title = VariantTitleField()
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_code = serializers.CharField(source="variant.product.product_code", read_only=True)
    product_image = serializers.SerializerMethodField()
    warehouse_id = serializers.UUIDField(read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    quantity_on_hand = serializers.IntegerField()
    quantity_reserved = serializers.IntegerField()
    available = serializers.IntegerField()
    avg_cost = serializers.DecimalField(max_digits=12, decimal_places=4)
    reorder_point = serializers.IntegerField()
    target_stock_level = serializers.IntegerField()

    def get_product_image(self, obj) -> str | None:
        return variant_image_url(obj.variant)


class StockLedgerEntrySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    variant_title = VariantTitleField()
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    product_image = serializers.SerializerMethodField()
    warehouse_id = serializers.UUIDField(read_only=True)
    warehouse_name = serializers.CharField(source="warehouse.name", read_only=True)
    warehouse_code = serializers.CharField(source="warehouse.code", read_only=True)
    movement_type = serializers.ChoiceField(choices=MovementType.choices)
    quantity = serializers.IntegerField()
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=4, allow_null=True, required=False
    )
    balance_after = serializers.IntegerField()
    reference_type = serializers.CharField(allow_blank=True)
    reference_id = serializers.UUIDField(allow_null=True, required=False)
    notes = serializers.CharField(allow_blank=True)
    created_by_id = serializers.UUIDField(allow_null=True, required=False)
    created_at = serializers.DateTimeField()

    def get_product_image(self, obj) -> str | None:
        return variant_image_url(obj.variant)


class StockAdjustmentSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    quantity_delta = serializers.IntegerField()
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=KINDS, required=False)


class BulkStockAdjustmentSerializer(serializers.Serializer):
    adjustments = serializers.ListField(child=StockAdjustmentSerializer(), min_length=1)
    kind = serializers.ChoiceField(choices=KINDS, required=False)


class StockWriteOffSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=KINDS, required=False)


class StockLookupVariantSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField(source="id", read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    product_name = serializers.SerializerMethodField()
    sku = serializers.CharField(read_only=True)
    barcode = serializers.CharField(read_only=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    available = serializers.SerializerMethodField()

    def get_product_name(self, obj) -> str:
        return obj.product.name

    def get_available(self, obj) -> int:
        available_by_variant = self.context.get("available_by_variant")
        if available_by_variant is not None:
            return available_by_variant.get(obj.id, 0)
        from apps.inventory.selectors.stock import available_quantity_for_variant

        return available_quantity_for_variant(obj)


class StockIntakeSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    warehouse_id = serializers.UUIDField(required=False, allow_null=True)
    quantity = serializers.IntegerField(min_value=1)
    unit_cost = serializers.DecimalField(
        max_digits=12, decimal_places=4, required=False, allow_null=True
    )
    notes = serializers.CharField(required=False, allow_blank=True)
    kind = serializers.ChoiceField(choices=KINDS, required=False)


class QuickProductCreateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField()
    name = serializers.CharField()
    sku = serializers.CharField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, default=0
    )
    barcode = serializers.CharField(required=False, allow_blank=True)
    description = serializers.CharField(required=False, allow_blank=True)


class StockTransferLineInputSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class StockTransferCreateSerializer(serializers.Serializer):
    from_warehouse_id = serializers.UUIDField()
    to_warehouse_id = serializers.UUIDField()
    lines = serializers.ListField(child=StockTransferLineInputSerializer(), min_length=1)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=255, default="")


class StockTransferLineSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    variant_id = serializers.UUIDField(read_only=True)
    variant_sku = serializers.CharField(source="variant.sku", read_only=True)
    variant_title = VariantTitleField()
    product_name = serializers.CharField(source="variant.product.name", read_only=True)
    quantity = serializers.IntegerField(read_only=True)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=4, read_only=True)


class StockTransferSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    transfer_number = serializers.CharField(read_only=True)
    from_warehouse_id = serializers.UUIDField(read_only=True)
    from_warehouse_name = serializers.CharField(source="from_warehouse.name", read_only=True)
    to_warehouse_id = serializers.UUIDField(read_only=True)
    to_warehouse_name = serializers.CharField(source="to_warehouse.name", read_only=True)
    notes = serializers.CharField(read_only=True)
    lines = StockTransferLineSerializer(many=True, read_only=True)
    created_by_id = serializers.UUIDField(read_only=True, allow_null=True)
    created_at = serializers.DateTimeField(read_only=True)
