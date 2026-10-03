from __future__ import annotations

from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.business.services.modules import require_feature
from apps.catalog.models import Product, ProductImage, ProductVariant
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.text import unique_sku_for, unique_slug_for


def product_variations_in_use() -> str | None:
    """Only a second variant strands data. A product merely *typed* `variant`
    that carries one is grandfathered — the type stops being visible, and
    `create_variant` refuses to add to it while the feature is off."""
    multi = (
        Product.objects.filter(deleted_at__isnull=True)
        .annotate(live_variants=Count("variants", filter=Q(variants__deleted_at__isnull=True)))
        .filter(live_variants__gt=1)
        .count()
    )
    if multi:
        return f"{multi} products still carry variants. Reduce them to one variant first."
    return None


def _require_variations_for_type(product_type: str) -> None:
    if product_type == Product.ProductType.VARIANT:
        require_feature(ModuleKey.CATALOG, "product_variations")


@transaction.atomic
def create_product(
    *,
    category,
    name: str,
    description: str = "",
    product_type: str = Product.ProductType.SIMPLE,
    highlights: list | None = None,
    price: Decimal | None = None,
    cost_price: Decimal = Decimal("0"),
    discount_price: Decimal | None = None,
    sku: str = "",
    meta_keywords: str = "",
    brand=None,
    featured: bool = False,
    actor=None,
) -> Product:
    _require_variations_for_type(product_type)
    product = Product(
        category=category,
        brand=brand,
        featured=featured,
        name=name,
        description=description,
        product_type=product_type,
        highlights=highlights or [],
        meta_keywords=meta_keywords,
        slug=unique_slug_for(model=Product, text=name),
    )
    product.save()
    if price is not None:
        create_variant(
            product=product,
            sku=sku,
            price=price,
            cost_price=cost_price,
            discount_price=discount_price,
            actor=actor,
        )
    return product


@transaction.atomic
def update_product(*, product: Product, data: dict) -> Product:
    allowed_fields = {
        "category",
        "brand",
        "featured",
        "name",
        "description",
        "product_type",
        "highlights",
        "meta_keywords",
        "is_active",
        "image",
    }
    if "product_type" in data:
        _require_variations_for_type(data["product_type"])
    for field, value in data.items():
        if field in allowed_fields:
            setattr(product, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if "name" in update_fields:
        product.slug = unique_slug_for(model=Product, text=product.name, instance=product)
        update_fields.append("slug")
    if update_fields:
        product.save(update_fields=update_fields)

    # Pricing is stored per-variant but edited product-wide, so a price change
    # fans out to every live variant of the product.
    price_updates = {f: data[f] for f in ("price", "cost_price", "discount_price") if f in data}
    if price_updates:
        variants = product.variants.filter(deleted_at__isnull=True)
        if variants.exists():
            for variant in variants:
                for field, value in price_updates.items():
                    setattr(variant, field, value)
                variant.save(update_fields=[*price_updates, "updated_at"])
        elif "price" in price_updates:
            # No variant yet to fan out to — this *is* the product's first price,
            # so create the variant instead of silently discarding it.
            create_variant(
                product=product,
                price=price_updates["price"],
                cost_price=price_updates.get("cost_price", Decimal("0")),
                discount_price=price_updates.get("discount_price"),
            )
    return product


@transaction.atomic
def delete_product(*, product: Product, actor=None) -> Product:
    from apps.common.services.soft_delete import soft_delete_instance

    soft_delete_instance(product, actor=actor)
    product.variants.filter(deleted_at__isnull=True).update(
        deleted_at=timezone.now(), is_active=False
    )
    return product


def stage_product_status(*, product: Product, is_active: bool) -> None:
    """Set the status in memory only; the caller writes the whole batch with a
    single `bulk_update`, which does not run `auto_now` on `updated_at`."""
    product.is_active = is_active
    product.updated_at = timezone.now()


def representative_variant(product: Product) -> ProductVariant | None:
    """The variant a product's shared price/cost/discount is read from."""
    return product.variants.filter(deleted_at__isnull=True).order_by("created_at").first()


@transaction.atomic
def create_variant(
    *,
    product: Product,
    sku: str = "",
    price: Decimal | None = None,
    cost_price: Decimal = Decimal("0"),
    discount_price: Decimal | None = None,
    barcode: str = "",
    weight: Decimal | None = None,
    color: str = "",
    size: str = "",
    # Wholesale fields
    wholesale_price: Decimal | None = None,
    show_wholesale_price: bool = False,
    # Pre-order fields
    is_preorder_enabled: bool = False,
    preorder_price: Decimal | None = None,
    preorder_start_date=None,
    preorder_end_date=None,
    release_date=None,
    preorder_stock_limit: int | None = None,
    actor=None,
) -> ProductVariant:
    # A new variation inherits the product's shared pricing instead of re-entering it.
    if price is None:
        sibling = representative_variant(product)
        if sibling is None:
            raise BusinessRuleViolationError(
                "This product has no price to inherit. Set a price first.",
                code="price_required",
            )
        price = sibling.price
        cost_price = sibling.cost_price
        discount_price = sibling.discount_price
    if sku and ProductVariant.objects.filter(sku=sku).exists():
        raise BusinessRuleViolationError(
            "A variant with this SKU already exists.", code="duplicate_sku"
        )
    if product.variants.filter(deleted_at__isnull=True).exists():
        if not is_feature_enabled(ModuleKey.CATALOG, "product_variations"):
            raise BusinessRuleViolationError(
                "Each product has one price and one SKU. Turn product variations on first.",
                code="simple_product_single_variant",
            )
        # The admin UI has no product-type selector; a second variant is what makes
        # a product a variant product, so promote rather than reject.
        if product.product_type == Product.ProductType.SIMPLE:
            product.product_type = Product.ProductType.VARIANT
            product.save(update_fields=["product_type", "updated_at"])
    if product.variants.filter(deleted_at__isnull=True, color=color, size=size).exists():
        raise BusinessRuleViolationError(
            "This colour and size combination already exists on the product.",
            code="duplicate_variant_combo",
        )
    if not sku:
        sku = unique_sku_for(model=ProductVariant, text=f"{product.slug}-{color}-{size}".strip("-"))
    variant = ProductVariant.objects.create(
        product=product,
        sku=sku,
        price=price,
        cost_price=cost_price,
        discount_price=discount_price,
        barcode=barcode,
        weight=weight,
        color=color,
        size=size,
        # Wholesale fields
        wholesale_price=wholesale_price,
        show_wholesale_price=show_wholesale_price,
        # Pre-order fields
        is_preorder_enabled=is_preorder_enabled,
        preorder_price=preorder_price,
        preorder_start_date=preorder_start_date,
        preorder_end_date=preorder_end_date,
        release_date=release_date,
        preorder_stock_limit=preorder_stock_limit,
    )
    try:
        variant.full_clean()
    except ValidationError as e:
        # Map validation errors to specific codes for pre-order fields
        error_dict = getattr(e, "message_dict", {})
        if "preorder_price" in error_dict:
            raise BusinessRuleViolationError(
                error_dict["preorder_price"][0], code="preorder_price_must_be_lower"
            ) from None
        if "preorder_end_date" in error_dict:
            raise BusinessRuleViolationError(
                error_dict["preorder_end_date"][0], code="preorder_end_date_before_start"
            ) from None
        if "release_date" in error_dict:
            raise BusinessRuleViolationError(
                error_dict["release_date"][0], code="release_date_before_preorder_end"
            ) from None
        # Fallback for any other validation errors
        raise BusinessRuleViolationError(str(e), code="validation_error") from None
    variant.save()
    live_variant_count = product.variants.filter(deleted_at__isnull=True).count()
    if product.product_type == Product.ProductType.SIMPLE and live_variant_count > 1:
        product.product_type = Product.ProductType.VARIANT
        product.save(update_fields=["product_type", "updated_at"])
    log_action(
        actor=actor,
        action="product_variant.created",
        target_type="ProductVariant",
        target_id=variant.id,
        metadata={"sku": variant.sku, "product_id": str(product.id)},
    )
    return variant


@transaction.atomic
def update_variant(*, variant: ProductVariant, data: dict, actor=None) -> ProductVariant:
    allowed_fields = {
        "sku",
        "barcode",
        "price",
        "cost_price",
        "discount_price",
        "weight",
        "color",
        "size",
        "is_active",
        # Wholesale fields
        "wholesale_price",
        "show_wholesale_price",
        # Pre-order fields
        "is_preorder_enabled",
        "preorder_price",
        "preorder_start_date",
        "preorder_end_date",
        "release_date",
        "preorder_stock_limit",
    }
    price_fields = {"price", "cost_price", "discount_price", "wholesale_price"}
    changed_fields = [field for field in data if field in allowed_fields]
    previous_values = {
        field: getattr(variant, field)
        for field in changed_fields
        if field == "sku" or field in price_fields
    }
    for field in changed_fields:
        setattr(variant, field, data[field])
    if changed_fields:
        try:
            variant.full_clean()
        except ValidationError as e:
            # Map validation errors to specific codes for pre-order fields
            error_dict = getattr(e, "message_dict", {})
            if "preorder_price" in error_dict:
                raise BusinessRuleViolationError(
                    error_dict["preorder_price"][0], code="preorder_price_must_be_lower"
                ) from None
            if "preorder_end_date" in error_dict:
                raise BusinessRuleViolationError(
                    error_dict["preorder_end_date"][0], code="preorder_end_date_before_start"
                ) from None
            if "release_date" in error_dict:
                raise BusinessRuleViolationError(
                    error_dict["release_date"][0], code="release_date_before_preorder_end"
                ) from None
            # Fallback for any other validation errors
            raise BusinessRuleViolationError(str(e), code="validation_error") from None
        variant.save(update_fields=changed_fields)

    if "sku" in changed_fields:
        log_action(
            actor=actor,
            action="product_variant.sku_changed",
            target_type="ProductVariant",
            target_id=variant.id,
            metadata={"old": previous_values["sku"], "new": variant.sku},
        )
    if price_fields & set(changed_fields):
        log_action(
            actor=actor,
            action="product_variant.price_changed",
            target_type="ProductVariant",
            target_id=variant.id,
            metadata={
                field: {"old": str(previous_values[field]), "new": str(getattr(variant, field))}
                for field in price_fields & set(changed_fields)
            },
        )
    if changed_fields:
        log_action(
            actor=actor,
            action="product_variant.updated",
            target_type="ProductVariant",
            target_id=variant.id,
            metadata={"fields": changed_fields},
        )
    return variant


@transaction.atomic
def deactivate_variant(*, variant: ProductVariant, actor=None) -> ProductVariant:
    variant.deactivate()
    log_action(
        actor=actor,
        action="product_variant.deactivated",
        target_type="ProductVariant",
        target_id=variant.id,
    )
    return variant


@transaction.atomic
def create_quick_product(
    *,
    category,
    name: str,
    sku: str,
    price: Decimal,
    cost_price: Decimal = Decimal("0"),
    description: str = "",
    barcode: str = "",
    actor=None,
) -> ProductVariant:
    """Create a product plus its first variant in one atomic call — the Stock
    App's "not found, create it" flow."""
    product = create_product(category=category, name=name, description=description)
    return create_variant(
        product=product,
        sku=sku,
        price=price,
        cost_price=cost_price,
        barcode=barcode,
        actor=actor,
    )


def create_product_image(
    *, product=None, variant=None, url: str, alt_text: str = "", sort_order: int = 0
) -> ProductImage:
    image = ProductImage(
        product=product, variant=variant, url=url, alt_text=alt_text, sort_order=sort_order
    )
    image.full_clean()
    image.save()
    return image


def update_product_image(*, image: ProductImage, data: dict) -> ProductImage:
    allowed_fields = {"url", "alt_text", "sort_order"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(image, field, data[field])
    if update_fields:
        image.full_clean()
        image.save(update_fields=update_fields)
    return image


def delete_product_image(*, image: ProductImage) -> None:
    image.delete()
