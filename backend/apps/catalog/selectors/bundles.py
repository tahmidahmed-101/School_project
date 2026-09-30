from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.db.models import QuerySet

from apps.catalog.models import Product, ProductVariant
from apps.inventory.selectors.stock import available_quantities_for_variants


def bundle_variants_list(*, include_deleted: bool = False) -> QuerySet[ProductVariant]:
    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related(
            "product__images",
            "bundle_components__component_variant__images",
            "bundle_components__component_variant__product__images",
        )
        .filter(product__product_type=Product.ProductType.BUNDLE)
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.order_by("sku")


def get_bundle_variant_by_id(
    variant_id: str | UUID, *, include_deleted: bool = False
) -> ProductVariant | None:
    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related(
            "product__images",
            "bundle_components__component_variant__images",
            "bundle_components__component_variant__product__images",
        )
        .filter(id=variant_id, product__product_type=Product.ProductType.BUNDLE)
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.first()


def public_bundle_variants_list() -> QuerySet[ProductVariant]:
    return (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related(
            "bundle_components__component_variant__product__images",
            "bundle_components__component_variant__product__variants__images",
        )
        .filter(
            deleted_at__isnull=True,
            is_active=True,
            product__product_type=Product.ProductType.BUNDLE,
            product__is_active=True,
        )
        .order_by("sku")
    )


def get_public_bundle_variant_by_slug(slug: str) -> ProductVariant | None:
    return (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related(
            "bundle_components__component_variant__product__images",
            "bundle_components__component_variant__product__variants__images",
        )
        .filter(
            deleted_at__isnull=True,
            is_active=True,
            product__slug=slug,
            product__product_type=Product.ProductType.BUNDLE,
            product__is_active=True,
        )
        .first()
    )


def bundle_available_quantities(variant_ids: Iterable[UUID]) -> dict[UUID, int]:
    """Max number of whole bundles sellable for each bundle variant, derived
    from component stock: `min(component available // component quantity)`.

    A variant with no components, or any component with zero available
    stock, yields 0 bundles sellable.
    """
    variants = list(
        ProductVariant.objects.filter(id__in=list(variant_ids)).prefetch_related(
            "bundle_components__component_variant"
        )
    )
    component_variant_ids = {
        item.component_variant_id
        for variant in variants
        for item in variant.bundle_components.all()
    }
    available = available_quantities_for_variants(component_variant_ids)
    result: dict[UUID, int] = {}
    for variant in variants:
        items = list(variant.bundle_components.all())
        if not items:
            result[variant.id] = 0
            continue
        bundle_available: int | None = None
        for item in items:
            component_available = available.get(item.component_variant_id, 0)
            per_bundle = component_available // item.quantity
            if bundle_available is None or per_bundle < bundle_available:
                bundle_available = per_bundle
        result[variant.id] = bundle_available if bundle_available is not None else 0
    return result


def expand_variant(variant: ProductVariant, quantity: int = 1) -> list[tuple[ProductVariant, int]]:
    """Flatten a sellable variant into the stock units that actually move.

    A simple variant maps 1:1 to itself. A bundle variant holds no stock of
    its own — its components' stock is what gets reserved and shipped, each
    scaled by the BundleItem quantity (blueprint §7: "no separate stock,
    decrements components")."""
    components = list(variant.bundle_components.all())
    if not components:
        return [(variant, quantity)]
    return [(item.component_variant, item.quantity * quantity) for item in components]
