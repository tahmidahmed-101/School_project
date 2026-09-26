from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from itertools import product as cartesian_product

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.catalog.models import Product, ProductVariant
from apps.catalog.selectors.products import variants_for_product
from apps.common.exceptions import BusinessRuleViolationError


@dataclass
class VariantGenerationResult:
    created: list[ProductVariant] = field(default_factory=list)
    skipped_existing: list[ProductVariant] = field(default_factory=list)
    stale: list[ProductVariant] = field(default_factory=list)


@transaction.atomic
def generate_variants(
    *,
    product: Product,
    colors: list[str],
    sizes: list[str],
    price: Decimal,
    cost_price: Decimal = Decimal("0"),
    actor=None,
) -> VariantGenerationResult:
    """Create the Cartesian product of `colors` x `sizes` as variants on
    `product`. Combinations that already exist are left untouched and reported
    back as `skipped_existing`; existing variants whose combination falls
    outside the requested selection are reported as `stale` for the admin to
    review rather than deleted automatically.
    """
    require_feature(ModuleKey.CATALOG, "product_variations")
    if not colors and not sizes:
        raise BusinessRuleViolationError(
            "Pick at least one colour or size.", code="no_variant_axes"
        )

    existing_by_combo: dict[tuple[str, str], ProductVariant] = {
        (variant.color, variant.size): variant for variant in variants_for_product(product)
    }

    requested_combos = list(cartesian_product(colors or [""], sizes or [""]))
    requested_combo_keys: set[tuple[str, str]] = set()

    result = VariantGenerationResult()
    existing_skus = set(ProductVariant.objects.values_list("sku", flat=True))
    new_variants: list[ProductVariant] = []

    for color, size in requested_combos:
        combo_key = (color, size)
        requested_combo_keys.add(combo_key)
        if combo_key in existing_by_combo:
            result.skipped_existing.append(existing_by_combo[combo_key])
            continue

        sku_suffix = "-".join(part for part in (color, size) if part)
        base_sku = f"{product.slug}-{sku_suffix}".upper().replace(" ", "-")
        sku = base_sku
        suffix_counter = 2
        while sku in existing_skus:
            sku = f"{base_sku}-{suffix_counter}"
            suffix_counter += 1
        existing_skus.add(sku)

        new_variants.append(
            ProductVariant(
                product=product,
                sku=sku,
                price=price,
                cost_price=cost_price,
                color=color,
                size=size,
            )
        )

    if new_variants:
        ProductVariant.objects.bulk_create(new_variants)
        result.created = new_variants
        if product.product_type == Product.ProductType.SIMPLE:
            product.product_type = Product.ProductType.VARIANT
            product.save(update_fields=["product_type", "updated_at"])

    result.stale = [
        variant
        for combo_key, variant in existing_by_combo.items()
        if combo_key not in requested_combo_keys
    ]

    log_action(
        actor=actor,
        action="product_variant.generated",
        target_type="Product",
        target_id=product.id,
        metadata={
            "created": len(result.created),
            "skipped_existing": len(result.skipped_existing),
            "stale": len(result.stale),
        },
    )
    return result
