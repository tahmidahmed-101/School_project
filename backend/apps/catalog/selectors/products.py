from __future__ import annotations

from uuid import UUID

from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from apps.catalog.models import Product, ProductImage, ProductVariant


def _active_variants_prefetch() -> Prefetch:
    # `to_attr="active_variants"` so ProductSerializer reads a plain list
    # instead of calling `.variants.filter(...)`, which would bypass the
    # prefetch cache and re-query per product.
    return Prefetch(
        "variants",
        queryset=ProductVariant.objects.filter(deleted_at__isnull=True)
        .select_related("product")
        .prefetch_related(
            "images",
            "product__images",
            "bundle_components__component_variant",
        ),
        to_attr="active_variants",
    )


SELLABLE_VARIANT_FILTER = Q(variants__deleted_at__isnull=True, variants__is_active=True)


def products_list(
    *,
    category=None,
    search: str | None = None,
    is_active: bool | None = True,
    include_deleted: bool = False,
    sellable_only: bool = False,
    include_bundles: bool = True,
    product_type: str | None = None,
    preorder_only: bool = False,
    preorder_active_only: bool = True,
    preorder_status: str | None = None,
    featured: bool | None = None,
    trending: bool | None = None,
    new_arrival: bool | None = None,
    badge: str | None = None,
) -> QuerySet[Product]:
    queryset = Product.objects.select_related("category").prefetch_related(
        _active_variants_prefetch(), "images"
    )
    if product_type == Product.ProductType.BUNDLE:
        include_bundles = True
    if not include_bundles:
        queryset = queryset.exclude(product_type=Product.ProductType.BUNDLE)
    if product_type:
        queryset = queryset.filter(product_type=product_type)
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    if category is not None:
        queryset = queryset.filter(category=category)
    if featured is not None:
        queryset = queryset.filter(featured=featured)
    if trending is not None:
        queryset = queryset.filter(trending=trending)
    if new_arrival is not None:
        queryset = queryset.filter(new_arrival=new_arrival)
    if badge:
        queryset = queryset.filter(badge=badge)
    if sellable_only:
        # A product with no live variant has no price and no stock; showing it
        # in a storefront is a dead end, not a listing.
        queryset = queryset.filter(SELLABLE_VARIANT_FILTER).distinct()
    if preorder_only or preorder_status:
        preorder_filter = Q(
            variants__is_preorder_enabled=True,
            variants__deleted_at__isnull=True,
        )
        active_window_filter = Q()
        if preorder_active_only or preorder_status in ("active", "inactive"):
            now = timezone.now()
            active_window_filter = Q(
                variants__preorder_start_date__lte=now,
                variants__preorder_end_date__gte=now,
            )
        if preorder_status == "active" or (preorder_active_only and not preorder_status):
            # Same active-window definition as ProductVariant.is_preorder_active.
            preorder_filter &= active_window_filter
        if preorder_status == "inactive":
            preorder_filter &= ~active_window_filter
        queryset = queryset.filter(preorder_filter).distinct()
    if search:
        queryset = queryset.filter(
            Q(name__icontains=search) | Q(variants__sku__icontains=search)
        ).distinct()
    return queryset.order_by("name")


def get_product_by_id(product_id: str | UUID, *, include_deleted: bool = False) -> Product | None:
    queryset = Product.objects.prefetch_related(_active_variants_prefetch(), "images")
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=product_id).first()


def get_product_by_slug(slug: str) -> Product | None:
    # Same prefetch as `get_product_by_id`: this backs the public product page,
    # whose serializer walks variants -> images/components.
    return (
        Product.objects.select_related("category")
        .prefetch_related(_active_variants_prefetch(), "images")
        .filter(SELLABLE_VARIANT_FILTER, slug=slug, deleted_at__isnull=True, is_active=True)
        .first()
    )


def get_variant_by_id(variant_id: str | UUID) -> ProductVariant | None:
    return ProductVariant.objects.filter(id=variant_id, deleted_at__isnull=True).first()


def get_variant_by_sku(sku: str) -> ProductVariant | None:
    return ProductVariant.objects.filter(sku=sku, deleted_at__isnull=True).first()


def get_variant_by_sku_or_barcode(identifier: str) -> ProductVariant | None:
    """Case-insensitive lookup by SKU or barcode — the Stock App's existence
    check before stocking or creating a product."""
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    return (
        ProductVariant.objects.filter(
            Q(sku__iexact=identifier) | Q(barcode__iexact=identifier),
            deleted_at__isnull=True,
        )
        .select_related("product")
        .first()
    )


def variants_for_product(product: Product) -> QuerySet[ProductVariant]:
    return (
        ProductVariant.objects.filter(product=product, deleted_at__isnull=True)
        .select_related("product")
        .prefetch_related("images", "product__images")
        .order_by("sku")
    )


def variants_list(
    *,
    product=None,
    category=None,
    color: str = "",
    size: str = "",
    is_active: bool | None = None,
) -> QuerySet[ProductVariant]:
    """Global, cross-product variant listing for the admin variant table —
    unlike `variants_for_product`, this isn't scoped to a single product."""
    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related("images", "product__images")
        .filter(deleted_at__isnull=True)
    )
    if product is not None:
        queryset = queryset.filter(product=product)
    if category is not None:
        queryset = queryset.filter(product__category=category)
    if color:
        queryset = queryset.filter(color=color)
    if size:
        queryset = queryset.filter(size=size)
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    return queryset.order_by("sku")


def get_product_image_by_id(image_id: str | UUID) -> ProductImage | None:
    return ProductImage.objects.filter(id=image_id).first()
