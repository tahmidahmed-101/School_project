from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from rest_framework import serializers

from api.v1.admin.catalog.serializers import ProductImageSerializer
from apps.catalog.selectors.images import variant_image_url


class BundleComponentInputSerializer(serializers.Serializer):
    component_variant_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class BundleCreateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField()
    name = serializers.CharField()
    sku = serializers.CharField(required=False, allow_blank=True)
    # Null/omitted price and cost_price are defaulted from the component totals.
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    description = serializers.CharField(required=False, allow_blank=True)
    barcode = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False, default=True)
    components = BundleComponentInputSerializer(many=True, allow_empty=False)


class BundleUpdateSerializer(serializers.Serializer):
    category_id = serializers.UUIDField(required=False)
    name = serializers.CharField(required=False)
    sku = serializers.CharField(required=False)
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    cost_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, required=False, allow_null=True
    )
    description = serializers.CharField(required=False, allow_blank=True)
    barcode = serializers.CharField(required=False, allow_blank=True)
    is_active = serializers.BooleanField(required=False)
    components = BundleComponentInputSerializer(many=True, required=False)


class BundleComponentSerializer(serializers.Serializer):
    component_variant_id = serializers.UUIDField(read_only=True)
    component_sku = serializers.SerializerMethodField()
    component_name = serializers.SerializerMethodField()
    quantity = serializers.IntegerField()
    component_price = serializers.SerializerMethodField()
    component_available = serializers.SerializerMethodField()
    component_image = serializers.SerializerMethodField()

    def get_component_sku(self, obj) -> str:
        return obj.component_variant.sku

    def get_component_name(self, obj) -> str:
        return obj.component_variant.product.name

    def get_component_price(self, obj) -> Decimal:
        return obj.component_variant.price

    def get_component_image(self, obj) -> str | None:
        return variant_image_url(obj.component_variant)

    def get_component_available(self, obj) -> int:
        stock_by_variant = self.context.get("stock_by_variant")
        if stock_by_variant is not None:
            return stock_by_variant.get(obj.component_variant_id, 0)
        from apps.inventory.selectors.stock import available_quantities_for_variants

        return available_quantities_for_variants([obj.component_variant_id]).get(
            obj.component_variant_id, 0
        )


class BundleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    name = serializers.SerializerMethodField()
    category_id = serializers.SerializerMethodField()
    sku = serializers.CharField()
    barcode = serializers.CharField()
    description = serializers.CharField(source="product.description", allow_blank=True)
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    cost_price = serializers.DecimalField(max_digits=12, decimal_places=2)
    is_active = serializers.BooleanField()
    deleted_at = serializers.DateTimeField(read_only=True, allow_null=True)
    discount_price = serializers.DecimalField(
        max_digits=12, decimal_places=2, allow_null=True, required=False
    )
    effective_price = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    available_stock = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    components = serializers.SerializerMethodField()

    def get_name(self, obj) -> str:
        return obj.product.name

    def get_category_id(self, obj) -> UUID | None:
        return obj.product.category_id

    def get_available_stock(self, obj) -> int:
        available_by_variant = self.context.get("available_by_variant")
        if available_by_variant is not None:
            return available_by_variant.get(obj.id, 0)
        from apps.catalog.selectors.bundles import bundle_available_quantities

        return bundle_available_quantities([obj.id]).get(obj.id, 0)

    def get_images(self, obj) -> list[dict]:
        return ProductImageSerializer(obj.product.images.all(), many=True).data

    def get_components(self, obj) -> list[dict]:
        return BundleComponentSerializer(
            obj.bundle_components.all(), many=True, context=self.context
        ).data
