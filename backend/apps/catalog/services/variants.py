from __future__ import annotations

from decimal import Decimal

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.catalog.models import Product, ProductVariant
from apps.catalog.selectors.options import product_combinations
from apps.common.exceptions import BusinessRuleViolationError

from .options import lock_product, resolve_combination
from .products import create_variant, representative_variant, update_variant

MAX_GENERATED_VARIANTS = 500
BULK_FIELDS = ("price", "discount_price", "cost_price", "is_active")


@transaction.atomic
def generate_variants(
    *,
    product: Product,
    combinations: list[list] | None = None,
    price: Decimal | None = None,
    cost_price: Decimal | None = None,
    actor=None,
) -> list[ProductVariant]:
    """Create the listed combinations (lists of option value ids), or every
    missing one when none are listed. A combination that already has a live
    variant is skipped."""
    require_feature(ModuleKey.CATALOG, "product_variations")
    product = lock_product(product)
    rows = product_combinations(product) if product.options.exists() else []
    taken = {
        frozenset(str(value_id) for value_id in row["value_ids"])
        for row in rows
        if row["variant_id"] is not None
    }
    if combinations is None:
        combinations = [row["value_ids"] for row in rows if row["variant_id"] is None]
    if len(combinations) > MAX_GENERATED_VARIANTS:
        raise BusinessRuleViolationError(
            f"That is {len(combinations)} variants. Create at most {MAX_GENERATED_VARIANTS} "
            "at a time.",
            code="too_many_combinations",
        )

    sibling = representative_variant(product)
    discount_price = None
    if price is None:
        if sibling is None:
            raise BusinessRuleViolationError(
                "This product has no price to inherit. Set a price first.", code="price_required"
            )
        price, discount_price = sibling.price, sibling.discount_price
    if cost_price is None:
        cost_price = sibling.cost_price if sibling else Decimal("0")

    created = []
    for value_ids in combinations:
        resolve_combination(product, value_ids)
        key = frozenset(str(value_id) for value_id in value_ids)
        if key in taken:
            continue
        taken.add(key)
        created.append(
            create_variant(
                product=product,
                option_value_ids=value_ids,
                price=price,
                cost_price=cost_price,
                discount_price=discount_price,
                actor=actor,
            )
        )
    log_action(
        actor=actor,
        action="product_variant.generated",
        target_type="Product",
        target_id=product.id,
        metadata={"created": len(created)},
    )
    return created


@transaction.atomic
def bulk_update_variants(
    *, product: Product, data: dict, variant_ids: list | None = None, actor=None
) -> list[ProductVariant]:
    """Set the given fields on the listed live variants of a product, or on all of them."""
    variants = ProductVariant.objects.filter(
        product=product, deleted_at__isnull=True
    ).select_related("product__category")
    if variant_ids is not None:
        variants = variants.filter(id__in=variant_ids)
        if variants.count() != len(set(variant_ids)):
            raise BusinessRuleViolationError(
                "These variants do not all belong to this product.", code="invalid_target"
            )
    changes = {field: data[field] for field in BULK_FIELDS if field in data}
    updated = []
    for variant in variants.order_by("sku"):
        price = changes.get("price", variant.price)
        discount = changes.get("discount_price", variant.discount_price)
        priced = "discount_price" in changes or "price" in changes
        if priced and discount is not None and discount >= price:
            raise BusinessRuleViolationError(
                f"The discount price of {variant.sku} would not be below its price.",
                code="discount_not_below_price",
            )
        updated.append(update_variant(variant=variant, data=dict(changes), actor=actor))
    return updated
