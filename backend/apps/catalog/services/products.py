from __future__ import annotations

from decimal import Decimal
from itertools import product as cartesian_product

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.catalog.models import Category, Product, ProductImage, ProductVariant
from apps.catalog.selectors.options import label_key, normalise_label
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.text import unique_sku_for, unique_slug_for

from .kind_rules import check_variant_kind, is_preorder_category
from .options import (
    build_title,
    ensure_combination_free,
    lock_product,
    resolve_combination,
    set_product_options,
    sync_product_type,
)


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


def _clean_specs(specs: list | None) -> list[dict]:
    rows = [
        {"name": normalise_label(row.get("name")), "value": normalise_label(row.get("value"))}
        for row in specs or []
    ]
    return [row for row in rows if row["name"] and row["value"]]


def _combination_ids(product: Product, combinations: list | None) -> list[list]:
    """Combinations given by value text, in option order, as value ids. None means all."""
    options = [
        {label_key(value.value): value.id for value in option.values.all()}
        for option in product.options.prefetch_related("values")
    ]
    if combinations is None:
        return [list(ids) for ids in cartesian_product(*(lookup.values() for lookup in options))]
    resolved = []
    for combination in combinations:
        if len(combination) != len(options):
            raise BusinessRuleViolationError(
                "Pick exactly one value for every option of the product.",
                code="variant_options_incomplete",
            )
        try:
            resolved.append(
                [lookup[label_key(text)] for lookup, text in zip(options, combination, strict=True)]
            )
        except KeyError:
            raise BusinessRuleViolationError(
                "A combination names a value that is not in the options.", code="invalid_target"
            ) from None
    return resolved


def _check_brand_kind(brand, category: Category) -> None:
    if brand is not None and brand.kind != category.category_type:
        raise BusinessRuleViolationError(
            "Pick a brand from the same side as the product: stock or pre-order.",
            code="brand_kind_mismatch",
        )


@transaction.atomic
def create_product(
    *,
    category,
    name: str,
    description: str = "",
    product_type: str = Product.ProductType.SIMPLE,
    highlights: list | None = None,
    specs: list | None = None,
    options: list | None = None,
    combinations: list | None = None,
    price: Decimal | None = None,
    cost_price: Decimal = Decimal("0"),
    discount_price: Decimal | None = None,
    sku: str = "",
    meta_keywords: str = "",
    brand=None,
    featured: bool = False,
    show_questions: bool = True,
    show_price_report: bool = True,
    is_active: bool = True,
    actor=None,
) -> Product:
    is_bundle = product_type == Product.ProductType.BUNDLE
    if options and is_bundle:
        raise BusinessRuleViolationError("A bundle takes no options.", code="bundle_no_options")
    if options and price is None:
        raise BusinessRuleViolationError(
            "A product with options needs a base price for its variants.", code="price_required"
        )
    _check_brand_kind(brand, category)
    product = Product(
        category=category,
        brand=brand,
        featured=featured,
        show_questions=show_questions,
        show_price_report=show_price_report,
        name=name,
        description=description,
        product_type=product_type if is_bundle else Product.ProductType.SIMPLE,
        highlights=highlights or [],
        specs=_clean_specs(specs),
        meta_keywords=meta_keywords,
        slug=unique_slug_for(model=Product, text=name),
        is_active=is_active,
        created_by=actor,
    )
    product.save()
    if options:
        set_product_options(
            product=product,
            options=[
                {"name": option["name"], "values": [{"value": value} for value in option["values"]]}
                for option in options
            ],
            actor=actor,
        )
        for value_ids in _combination_ids(product, combinations):
            create_variant(
                product=product,
                option_value_ids=value_ids,
                price=price,
                cost_price=cost_price,
                discount_price=discount_price,
                actor=actor,
            )
        product.refresh_from_db(fields=["product_type"])
    elif price is not None:
        create_variant(
            product=product,
            sku=sku,
            price=price,
            cost_price=cost_price,
            discount_price=discount_price,
            actor=actor,
        )
    return product


PREORDER_RULE_FIELDS = frozenset(
    {"is_preorder_enabled", "preorder_start_date", "preorder_end_date"}
)


def _check_preorder_rules(*, product: Product, enabled: bool, start_date, end_date) -> None:
    """A pre-order variant needs its window and lives only in a pre-order
    category, so the two shops never share a product."""
    if not enabled:
        return
    if start_date is None or end_date is None:
        raise BusinessRuleViolationError(
            "A pre-order needs both a start and an end date.", code="preorder_dates_required"
        )
    if product.category.category_type != Category.CategoryType.PREORDER:
        raise BusinessRuleViolationError(
            "Pre-order can only be switched on for a product in a pre-order category.",
            code="preorder_category_required",
        )


def _check_category_keeps_kind(product: Product, category: Category) -> None:
    if category.category_type != product.category.category_type:
        raise BusinessRuleViolationError(
            "A product cannot move between a stock category and a pre-order category.",
            code="category_kind_mismatch",
        )


@transaction.atomic
def update_product(*, product: Product, data: dict) -> Product:
    allowed_fields = {
        "category",
        "brand",
        "featured",
        "show_questions",
        "show_price_report",
        "name",
        "description",
        "highlights",
        "specs",
        "meta_keywords",
        "is_active",
        "image",
    }
    if "specs" in data:
        data = {**data, "specs": _clean_specs(data["specs"])}
    if data.get("category") is not None:
        _check_category_keeps_kind(product, data["category"])
    brand = data.get("brand", product.brand)
    category = data.get("category") or product.category
    if brand != product.brand or category != product.category:
        _check_brand_kind(brand, category)
    for field, value in data.items():
        if field in allowed_fields:
            setattr(product, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if "name" in update_fields:
        product.slug = unique_slug_for(model=Product, text=product.name, instance=product)
        update_fields.append("slug")
    if update_fields:
        product.save(update_fields=update_fields)

    # A product without options is edited as one price. With options the price
    # belongs to each variant, so a product-level price is not applied.
    price_updates = {f: data[f] for f in ("price", "cost_price", "discount_price") if f in data}
    if price_updates and not product.options.exists():
        check_variant_kind(category=product.category, values=price_updates)
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


MAX_STOCK_BLOCKERS_SHOWN = 3


def _ensure_no_stock(product: Product, *, variant: ProductVariant | None = None) -> None:
    """Refuse to delete a product while any of its variants, deleted ones
    included, still has stock on hand or reserved in any warehouse, or an
    active reservation. Stock must be cleared through the write-off flow and
    reservations resolved first: deleting never writes anything off or
    releases a hold by itself. The variants' stock rows stay locked until the
    delete commits, so no movement or reservation can land in between."""
    from apps.inventory.services.stock import lock_variant_stock
    from apps.orders.models import StockReservation

    variant_ids = (
        [variant.id] if variant else list(product.variants.values_list("id", flat=True))
    )
    subject = variant.sku if variant else product.name
    noun = "variant" if variant else "product"
    if not variant_ids:
        return
    blockers = [
        f"{item.variant.sku} in {item.warehouse.name}: {item.quantity_on_hand} on hand, "
        f"{item.quantity_reserved} reserved"
        for item in lock_variant_stock(variant_ids)
        if item.quantity_on_hand or item.quantity_reserved
    ]
    active_reservations = StockReservation.objects.filter(
        Q(variant_id__in=variant_ids) | Q(order_line__variant_id__in=variant_ids),
        status=StockReservation.Status.ACTIVE,
    ).count()
    if active_reservations:
        blockers.append(f"{active_reservations} active order reservation(s)")
    if not blockers:
        return
    shown = "; ".join(blockers[:MAX_STOCK_BLOCKERS_SHOWN])
    if len(blockers) > MAX_STOCK_BLOCKERS_SHOWN:
        shown += f"; and {len(blockers) - MAX_STOCK_BLOCKERS_SHOWN} more"
    if is_preorder_category(product.category):
        raise BusinessRuleViolationError(
            f"{subject} still has received goods ({shown}). Clear them and resolve the "
            f"pre-orders holding them before deleting the {noun}.",
            code="product_stock_in_use",
        )
    raise BusinessRuleViolationError(
        f"{subject} still has stock ({shown}). Write the stock off under Inventory and "
        f"resolve the orders holding it before deleting the {noun}.",
        code="product_stock_in_use",
    )


@transaction.atomic
def delete_product(*, product: Product, actor=None) -> Product:
    from apps.common.services.soft_delete import soft_delete_instance

    _ensure_no_stock(product)
    soft_delete_instance(product, actor=actor)
    product.variants.filter(deleted_at__isnull=True).update(
        deleted_at=timezone.now(), is_active=False
    )
    return product


@transaction.atomic
def restore_product(product: Product) -> Product:
    """Undo `delete_product`: bring back the product and the variants deleted with it.

    Variants removed on their own before the product was deleted stay deleted.
    """
    from apps.common.services.soft_delete import restore_instance

    deleted_at = product.deleted_at
    restore_instance(product)
    product.variants.filter(deleted_at__gte=deleted_at).update(deleted_at=None, is_active=True)
    return product


def stage_product_status(*, product: Product, is_active: bool) -> None:
    """Set the status in memory only; the caller writes the whole batch with a
    single `bulk_update`, which does not run `auto_now` on `updated_at`."""
    product.is_active = is_active
    product.updated_at = timezone.now()


def representative_variant(product: Product) -> ProductVariant | None:
    """The variant a product's shared price/cost/discount is read from."""
    return product.variants.filter(deleted_at__isnull=True).order_by("created_at").first()


# Model validation errors on these fields, in this order, get their own code.
VARIANT_CLEAN_ERROR_CODES = {
    "preorder_price": "preorder_price_must_be_lower",
    "preorder_end_date": "preorder_end_date_before_start",
    "release_date": "release_date_before_preorder_end",
    "preorder_min_quantity": "invalid_preorder_min_quantity",
}


def _full_clean_variant(variant: ProductVariant) -> None:
    try:
        variant.full_clean()
    except ValidationError as e:
        error_dict = getattr(e, "message_dict", {})
        for field, code in VARIANT_CLEAN_ERROR_CODES.items():
            if field in error_dict:
                raise BusinessRuleViolationError(error_dict[field][0], code=code) from None
        raise BusinessRuleViolationError(str(e), code="validation_error") from None


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
    option_value_ids: list | None = None,
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
    preorder_min_quantity: int = 1,
    actor=None,
) -> ProductVariant:
    product = lock_product(product)
    _check_preorder_rules(
        product=product,
        enabled=is_preorder_enabled,
        start_date=preorder_start_date,
        end_date=preorder_end_date,
    )
    check_variant_kind(
        category=product.category,
        values={
            "discount_price": discount_price,
            "wholesale_price": wholesale_price,
            "is_preorder_enabled": is_preorder_enabled,
            "preorder_price": preorder_price,
            "preorder_start_date": preorder_start_date,
            "preorder_end_date": preorder_end_date,
            "release_date": release_date,
            "preorder_stock_limit": preorder_stock_limit,
            "preorder_min_quantity": preorder_min_quantity,
        },
    )
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
    if product.variants.filter(
        deleted_at__isnull=True
    ).exists() and not is_feature_enabled(ModuleKey.CATALOG, "product_variations"):
        raise BusinessRuleViolationError(
            "Each product has one price and one SKU. Turn product variations on first.",
            code="simple_product_single_variant",
        )
    values = resolve_combination(product, option_value_ids)
    ensure_combination_free(product, values)
    if not sku:
        sku = unique_sku_for(
            model=ProductVariant, text="-".join([product.slug, *(v.value for v in values)])
        )
    variant = ProductVariant.objects.create(
        product=product,
        sku=sku,
        price=price,
        cost_price=cost_price,
        discount_price=discount_price,
        barcode=barcode,
        weight=weight,
        title=build_title(values),
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
        preorder_min_quantity=preorder_min_quantity,
    )
    _full_clean_variant(variant)
    variant.save()
    variant.option_values.set(values)
    sync_product_type(product)
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
        "preorder_min_quantity",
    }
    price_fields = {"price", "cost_price", "discount_price", "wholesale_price"}
    changed_fields = [field for field in data if field in allowed_fields]
    previous_values = {
        field: getattr(variant, field)
        for field in changed_fields
        if field == "sku" or field in price_fields
    }
    new_values = _changed_combination(variant, data)
    if "sku" in changed_fields and data["sku"] != variant.sku:
        _refuse_if_on_order(variant)
        if ProductVariant.objects.filter(sku=data["sku"]).exclude(pk=variant.pk).exists():
            raise BusinessRuleViolationError(
                "A variant with this SKU already exists.", code="duplicate_sku"
            )
    for field in changed_fields:
        setattr(variant, field, data[field])
    if new_values is not None:
        variant.title = build_title(new_values)
        changed_fields.append("title")
    if PREORDER_RULE_FIELDS.intersection(changed_fields):
        _check_preorder_rules(
            product=variant.product,
            enabled=variant.is_preorder_enabled,
            start_date=variant.preorder_start_date,
            end_date=variant.preorder_end_date,
        )
    # Only what this save sets, so a legacy mixed row can still be cleaned up.
    check_variant_kind(
        category=variant.product.category,
        values={field: data[field] for field in changed_fields if field in data},
    )
    if changed_fields:
        _full_clean_variant(variant)
        variant.save(update_fields=changed_fields)
    if new_values is not None:
        variant.option_values.set(new_values)

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


def _refuse_if_on_order(variant: ProductVariant) -> None:
    if variant.sales_order_lines.exists():
        raise BusinessRuleViolationError(
            "This variant is on an order, so its options and SKU are fixed. "
            "Add a new variant instead.",
            code="variant_in_use",
        )


def _changed_combination(variant: ProductVariant, data: dict) -> list | None:
    """The new option values when `option_value_ids` really changes them, else None."""
    if "option_value_ids" not in data:
        return None
    product = lock_product(variant.product)
    values = resolve_combination(product, data["option_value_ids"])
    current = set(variant.option_values.values_list("id", flat=True))
    if {value.id for value in values} == current:
        return None
    _refuse_if_on_order(variant)
    ensure_combination_free(product, values, exclude=variant)
    return values


@transaction.atomic
def delete_variant(*, variant: ProductVariant, actor=None) -> ProductVariant:
    """Soft delete: the combination is free again, the SKU stays taken for history."""
    from apps.common.services.soft_delete import soft_delete_instance

    product = lock_product(variant.product)
    if not product.variants.filter(deleted_at__isnull=True).exclude(pk=variant.pk).exists():
        raise BusinessRuleViolationError(
            "A product keeps at least one variant. Delete the product instead.",
            code="last_variant",
        )
    _ensure_no_stock(product, variant=variant)
    if variant.used_in_bundles.filter(bundle_variant__deleted_at__isnull=True).exists():
        raise BusinessRuleViolationError(
            "This variant is part of a bundle. Take it out of the bundle first.",
            code="variant_in_bundle",
        )
    soft_delete_instance(variant, actor=actor)
    variant.is_active = False
    variant.save(update_fields=["is_active"])
    log_action(
        actor=actor,
        action="product_variant.deleted",
        target_type="ProductVariant",
        target_id=variant.id,
        metadata={"sku": variant.sku, "product_id": str(product.id)},
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
    App's "not found, create it" flow. Stock only: a pre-order product needs
    its ordering window, which this flow does not take."""
    if is_preorder_category(category):
        raise BusinessRuleViolationError(
            "A pre-order product is created under Pre-orders, not from stock intake.",
            code="stock_kind_mismatch",
        )
    product = create_product(category=category, name=name, description=description)
    return create_variant(
        product=product,
        sku=sku,
        price=price,
        cost_price=cost_price,
        barcode=barcode,
        actor=actor,
    )


def _check_image_option_value(image: ProductImage) -> None:
    if image.option_value is None:
        return
    if image.product_id is None or image.option_value.option.product_id != image.product_id:
        raise BusinessRuleViolationError(
            "This option value does not belong to the image's product.", code="invalid_target"
        )


def create_product_image(
    *,
    product=None,
    variant=None,
    option_value=None,
    url: str,
    alt_text: str = "",
    sort_order: int = 0,
) -> ProductImage:
    image = ProductImage(
        product=product,
        variant=variant,
        option_value=option_value,
        url=url,
        alt_text=alt_text,
        sort_order=sort_order,
    )
    _check_image_option_value(image)
    image.full_clean()
    image.save()
    return image


def update_product_image(*, image: ProductImage, data: dict) -> ProductImage:
    allowed_fields = {"url", "alt_text", "sort_order", "option_value"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(image, field, data[field])
    _check_image_option_value(image)
    if update_fields:
        image.full_clean()
        image.save(update_fields=update_fields)
    return image


def delete_product_image(*, image: ProductImage) -> None:
    image.delete()
