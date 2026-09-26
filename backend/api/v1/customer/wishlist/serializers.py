from __future__ import annotations

from rest_framework import serializers


class WishlistProductSerializer(serializers.Serializer):
    """Minimal product summary — not the full public catalog serializer, which
    also wires in stock context this list doesn't need."""

    id = serializers.UUIDField(read_only=True)
    name = serializers.CharField()
    slug = serializers.CharField()
    image = serializers.SerializerMethodField()
    price = serializers.SerializerMethodField()

    def get_image(self, obj) -> str | None:
        images = list(obj.images.all())
        if not images:
            return None
        return min(images, key=lambda image: image.sort_order).url

    def get_price(self, obj) -> str | None:
        variants = getattr(obj, "active_variants", None)
        if variants is None:
            variants = list(obj.variants.filter(deleted_at__isnull=True))
        variants = [variant for variant in variants if variant.is_active]
        if not variants:
            return None
        cheapest = min(variants, key=lambda variant: variant.effective_price)
        return str(cheapest.effective_price)


class WishlistItemSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    product_id = serializers.UUIDField(read_only=True)
    created_at = serializers.DateTimeField(read_only=True)
    product = serializers.SerializerMethodField()

    def get_product(self, obj) -> dict:
        return WishlistProductSerializer(obj.product).data


class AddWishlistItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
