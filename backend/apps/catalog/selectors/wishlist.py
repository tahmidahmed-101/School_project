from __future__ import annotations

from uuid import UUID

from django.db.models import Prefetch, QuerySet

from apps.catalog.models import ProductVariant, WishlistItem


def _active_product_variants_prefetch() -> Prefetch:
    # Same shape as catalog.selectors.products._active_variants_prefetch, just
    # rooted at "product__variants" instead of "variants" for this join.
    return Prefetch(
        "product__variants",
        queryset=ProductVariant.objects.filter(deleted_at__isnull=True).prefetch_related("images"),
        to_attr="active_variants",
    )


def wishlist_for_customer(customer) -> QuerySet[WishlistItem]:
    return (
        WishlistItem.objects.filter(customer=customer)
        .select_related("product__category")
        .prefetch_related("product__images", _active_product_variants_prefetch())
        .order_by("-created_at")
    )


def get_wishlist_item(customer, product_id: str | UUID) -> WishlistItem | None:
    return WishlistItem.objects.filter(customer=customer, product_id=product_id).first()
