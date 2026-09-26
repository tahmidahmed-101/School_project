from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

from apps.catalog.selectors.bundles import bundle_available_quantities
from apps.inventory.selectors.stock import available_quantities_for_variants

STOCK_CONTEXT_KEY = "stock_by_variant"


def active_variants_of(product) -> list:
    """The product's live variants, preferring the `active_variants` list that
    `_active_variants_prefetch` attaches. Re-filtering `product.variants` would
    issue a fresh query per product and throw the prefetch away."""
    cached = getattr(product, "active_variants", None)
    if cached is None:
        cached = list(product.variants.filter(deleted_at__isnull=True))
    return [variant for variant in cached if variant.is_active]


def stock_by_variant(variants) -> dict:
    """Available quantity for every variant in one pass — one aggregate for the
    plain variants and one batch resolution for the bundles."""
    variants = list(variants)
    bundle_ids = [v.id for v in variants if list(v.bundle_components.all())]
    bundles = set(bundle_ids)
    result = available_quantities_for_variants([v.id for v in variants if v.id not in bundles])
    if bundle_ids:
        result.update(bundle_available_quantities(bundle_ids))
    return result


def stock_context_for_products(products) -> dict:
    variants = [variant for product in products for variant in active_variants_of(product)]
    return {STOCK_CONTEXT_KEY: stock_by_variant(variants)}


class PublicCategorySerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField()
    parent_id = serializers.UUIDField(allow_null=True)


class PublicBundleComponentSerializer(serializers.Serializer):
    variant_id = serializers.UUIDField(read_only=True)
    sku = serializers.CharField()
    quantity = serializers.IntegerField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2)


class PublicProductVariantSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    sku = serializers.CharField()
    price = serializers.DecimalField(max_digits=12, decimal_places=2)
    compare_at_price = serializers.SerializerMethodField()
    discount_price = serializers.SerializerMethodField()
    effective_price = serializers.SerializerMethodField()
    in_stock = serializers.SerializerMethodField()
    color = serializers.CharField()
    size = serializers.CharField()
    components = serializers.SerializerMethodField()
    is_bundle = serializers.SerializerMethodField()
    # Pre-order fields
    is_preorder_enabled = serializers.BooleanField(read_only=True)
    preorder_price = serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True)
    preorder_start_date = serializers.DateTimeField(allow_null=True)
    preorder_end_date = serializers.DateTimeField(allow_null=True)
    release_date = serializers.DateTimeField(allow_null=True)
    is_preorder_active = serializers.SerializerMethodField()
    is_preorder_price_applied = serializers.SerializerMethodField()

    def _bundle_components(self, obj) -> list:
        return list(obj.bundle_components.all())

    def get_compare_at_price(self, obj) -> str | None:
        """Original price before discount (same as list price when discount applies)."""
        if obj.discount_price is not None and obj.discount_price < obj.price:
            return str(obj.price)
        if (
            obj.is_preorder_active
            and obj.preorder_price is not None
            and obj.preorder_price < obj.price
        ):
            return str(obj.price)
        return None

    def get_discount_price(self, obj) -> str | None:
        # Only a discount below list price is a discount; anything else would
        # render as a "sale" that raises the price.
        if obj.discount_price is None or obj.discount_price >= obj.price:
            return None
        return str(obj.discount_price)

    def get_effective_price(self, obj) -> str:
        """The price the customer actually pays (pre-order price if active,
        else discount price if valid)."""
        return str(obj.effective_price)

    def get_in_stock(self, obj) -> bool:
        # Exact quantity stays internal — the storefront only needs yes/no.
        stock = self.context.get(STOCK_CONTEXT_KEY)
        if stock is None:
            stock = stock_by_variant([obj])
        return stock.get(obj.id, 0) > 0

    def get_is_bundle(self, obj) -> bool:
        return bool(self._bundle_components(obj))

    def get_is_preorder_active(self, obj) -> bool:
        return obj.is_preorder_active

    def get_is_preorder_price_applied(self, obj) -> bool:
        return obj.is_preorder_price_applied

    def get_components(self, obj) -> list[dict]:
        components = self._bundle_components(obj)
        if not components:
            return []
        return PublicBundleComponentSerializer(
            [
                {
                    "variant_id": item.component_variant_id,
                    "sku": item.component_variant.sku,
                    "quantity": item.quantity,
                    "price": item.component_variant.price,
                }
                for item in components
            ],
            many=True,
        ).data


class PublicBundleItemProductSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    slug = serializers.CharField()
    name = serializers.CharField()
    category_id = serializers.UUIDField(read_only=True)
    image = serializers.SerializerMethodField()

    def get_image(self, obj) -> str | None:
        # ProductImage.Meta already orders by sort_order, so reading the
        # prefetched list beats re-ordering (which would re-query per row).
        # Variant images count too, matching the product endpoint — otherwise a
        # component photographed per-variant shows a placeholder in the combo.
        images = list(obj.images.all())
        if not images:
            images = [image for variant in obj.variants.all() for image in variant.images.all()]
        return images[0].url if images else None


class PublicBundleItemSerializer(serializers.Serializer):
    quantity = serializers.IntegerField()
    price = serializers.DecimalField(
        max_digits=12, decimal_places=2, source="component_variant.price"
    )
    product = serializers.SerializerMethodField()

    def get_product(self, obj) -> dict:
        return PublicBundleItemProductSerializer(obj.component_variant.product).data


class PublicBundleSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    slug = serializers.CharField(source="product.slug")
    name = serializers.CharField(source="product.name")
    description = serializers.CharField(source="product.description", allow_blank=True)
    highlights = serializers.ListField(source="product.highlights", child=serializers.CharField())
    price = serializers.DecimalField(max_digits=12, decimal_places=2, source="effective_price")
    original_price = serializers.SerializerMethodField()
    components = serializers.SerializerMethodField()

    def get_original_price(self, obj) -> str:
        """What the combo would cost otherwise — the higher of its list price and
        the sum of buying the components separately, so it never undercuts `price`."""
        components_total = sum(
            (item.component_variant.price * item.quantity for item in obj.bundle_components.all()),
            Decimal("0"),
        )
        return str(max(components_total, obj.price))

    def get_components(self, obj) -> list[dict]:
        return PublicBundleItemSerializer(obj.bundle_components.all(), many=True).data


class PublicProductListSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    category_id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField()
    product_type = serializers.CharField()
    tagline = serializers.CharField(allow_blank=True)
    featured = serializers.BooleanField(read_only=True)
    trending = serializers.BooleanField(read_only=True)
    new_arrival = serializers.BooleanField(read_only=True)
    badge = serializers.CharField(read_only=True)
    specs = serializers.JSONField(read_only=True)
    variants = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()

    def get_variants(self, obj) -> list[dict]:
        return PublicProductVariantSerializer(
            active_variants_of(obj), many=True, context=self.context
        ).data

    def get_images(self, obj) -> list[dict]:
        # Variant images are included too: the admin panel lets an image be attached
        # to a variant instead of the product, and those would otherwise never reach
        # the storefront. Both sides are prefetched, so this stays query-free.
        images = list(obj.images.all())
        for variant in active_variants_of(obj):
            images.extend(variant.images.all())
        seen: set[str] = set()
        unique = []
        for image in images:
            if image.url in seen:
                continue
            seen.add(image.url)
            unique.append(image)
        # Re-sorted after the merge, or a variant image the admin ordered first
        # would still land behind every product image.
        unique.sort(key=lambda image: image.sort_order)
        return [
            {"url": image.url, "alt_text": image.alt_text, "sort_order": image.sort_order}
            for image in unique
        ]


class PublicProductDetailSerializer(PublicProductListSerializer):
    description = serializers.CharField(allow_blank=True)


class PublicProductReviewSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    customer_name = serializers.SerializerMethodField()
    rating = serializers.IntegerField(read_only=True)
    comment = serializers.CharField(read_only=True, allow_blank=True)
    is_verified_purchase = serializers.BooleanField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)

    def get_customer_name(self, obj) -> str:
        return obj.customer.get_full_name().strip() or "Anonymous"
