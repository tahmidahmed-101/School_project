from __future__ import annotations

from uuid import UUID

from django.db.models import Case, Count, Prefetch, Q, QuerySet, Value, When
from django.db.models.functions import Coalesce
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


def _filter_basic_product_fields(
    queryset: QuerySet[Product],
    *,
    category,
    category_type: str | None,
    is_active: bool | None,
    include_deleted: bool,
    product_type: str | None,
    include_bundles: bool,
    featured: bool | None,
    trending: bool | None,
    new_arrival: bool | None,
    badge: str | None,
) -> QuerySet[Product]:
    """The plain equality/exclude filters on `products_list`, split out so the
    surrounding function's own branching (preorder window, search,
    sellable-only) stays under the project's McCabe complexity limit."""
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
    if category_type:
        queryset = queryset.filter(category__category_type=category_type)
    if featured is not None:
        queryset = queryset.filter(featured=featured)
    if trending is not None:
        queryset = queryset.filter(trending=trending)
    if new_arrival is not None:
        queryset = queryset.filter(new_arrival=new_arrival)
    if badge:
        queryset = queryset.filter(badge=badge)
    return queryset


def products_list(
    *,
    category=None,
    category_type: str | None = None,
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
    queryset = _filter_basic_product_fields(
        queryset,
        category=category,
        category_type=category_type,
        is_active=is_active,
        include_deleted=include_deleted,
        product_type=product_type,
        include_bundles=include_bundles,
        featured=featured,
        trending=trending,
        new_arrival=new_arrival,
        badge=badge,
    )
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


def _public_products() -> QuerySet[Product]:
    # Same prefetch as `get_product_by_id`: this backs the public product page,
    # whose serializer walks variants -> images/components.
    return (
        Product.objects.select_related("category")
        .prefetch_related(_active_variants_prefetch(), "images")
        .filter(SELLABLE_VARIANT_FILTER, deleted_at__isnull=True, is_active=True)
    )


def get_product_by_slug(slug: str) -> Product | None:
    return _public_products().filter(slug=slug).first()


def get_public_product_by_id(product_id: str | UUID) -> Product | None:
    """By-id counterpart to `get_product_by_slug`, for customer submissions
    (questions, price reports) that must only target what the storefront shows."""
    return _public_products().filter(id=product_id).first()


def category_storefront_summaries() -> dict[UUID, dict]:
    """Per category, what the storefront shows about it without loading every
    product: how many products it lists, and the picture of the first of them
    (by name) that has one. Two queries whatever the catalogue size."""
    listed = products_list(is_active=True, sellable_only=True).order_by()
    summaries: dict[UUID, dict] = {
        category_id: {"product_count": count, "image": None}
        for category_id, count in listed.values("category_id")
        .annotate(count=Count("id", distinct=True))
        .values_list("category_id", "count")
    }
    listed_ids = listed.values("id")
    images = (
        ProductImage.objects.filter(
            Q(product_id__in=listed_ids)
            | Q(
                variant__product_id__in=listed_ids,
                variant__is_active=True,
                variant__deleted_at__isnull=True,
            )
        )
        .annotate(
            category_id=Coalesce("product__category_id", "variant__product__category_id"),
            product_name=Coalesce("product__name", "variant__product__name"),
        )
        .order_by("product_name", "sort_order")
        .values_list("category_id", "url")
    )
    for category_id, url in images:
        summary = summaries.get(category_id)
        if summary is not None and summary["image"] is None:
            summary["image"] = url
    return summaries


RELATED_PRODUCTS_LIMIT = 8
MAX_RELATED_PRODUCTS = 24


def related_products(product: Product, *, limit: int = RELATED_PRODUCTS_LIMIT) -> list[Product]:
    """Storefront "you may also like" for one product, ranked in a single query:
    same category and brand, then same category, then same brand, then the
    merchandised (featured/trending) catalog as a filler. Built on
    `products_list` so it inherits the sellable filter and the prefetches the
    public list serializer depends on."""
    same_category = Q(category_id=product.category_id)
    same_brand = Q(brand_id=product.brand_id) if product.brand_id else Q(pk__in=[])
    merchandised = Q(featured=True) | Q(trending=True)
    score = Case(When(same_category, then=Value(2)), default=Value(0)) + Case(
        When(same_brand, then=Value(1)), default=Value(0)
    )
    return list(
        products_list(is_active=True, sellable_only=True)
        .exclude(pk=product.pk)
        .filter(same_category | same_brand | merchandised)
        .annotate(relevance=score)
        .order_by("-relevance", "-featured", "-trending", "name")[:limit]
    )


def get_variant_by_id(variant_id: str | UUID) -> ProductVariant | None:
    return ProductVariant.objects.filter(id=variant_id, deleted_at__isnull=True).first()


def get_variants_by_ids(variant_ids: list[str | UUID]) -> QuerySet[ProductVariant]:
    """Bulk counterpart to `get_variant_by_id` — one query for a list of ids
    instead of one query per id, for callers that price or weigh several
    items at once (guest shipping quotes, coupon previews)."""
    return ProductVariant.objects.filter(id__in=variant_ids, deleted_at__isnull=True)


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
    category_type: str | None = None,
    color: str = "",
    size: str = "",
    is_active: bool | None = None,
    preorder_only: bool = False,
    preorder_status: str | None = None,
    preorder_active_only: bool = True,
) -> QuerySet[ProductVariant]:
    """Global, cross-product variant listing for the admin variant table —
    unlike `variants_for_product`, this isn't scoped to a single product."""
    from django.utils import timezone

    queryset = (
        ProductVariant.objects.select_related("product", "product__category")
        .prefetch_related("images", "product__images")
        .filter(deleted_at__isnull=True)
    )
    if product is not None:
        queryset = queryset.filter(product=product)
    if category is not None:
        queryset = queryset.filter(product__category=category)
    if category_type:
        queryset = queryset.filter(product__category__category_type=category_type)
    if color:
        queryset = queryset.filter(color=color)
    if size:
        queryset = queryset.filter(size=size)
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    if preorder_only or preorder_status:
        preorder_filter = Q(
            is_preorder_enabled=True,
            deleted_at__isnull=True,
        )
        active_window_filter = Q()
        if preorder_active_only or preorder_status in ("active", "inactive"):
            now = timezone.now()
            active_window_filter = Q(
                preorder_start_date__lte=now,
                preorder_end_date__gte=now,
            )
        if preorder_status == "active" or (preorder_active_only and not preorder_status):
            preorder_filter &= active_window_filter
        if preorder_status == "inactive":
            preorder_filter &= ~active_window_filter
        queryset = queryset.filter(preorder_filter).distinct()
    return queryset.order_by("sku")


def get_product_image_by_id(image_id: str | UUID) -> ProductImage | None:
    return ProductImage.objects.filter(id=image_id).first()
