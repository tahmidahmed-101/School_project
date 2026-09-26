from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from uuid import UUID

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.business.constants import ModuleKey
from apps.business.services.modules import require_feature
from apps.catalog.models import BundleItem, Product, ProductVariant
from apps.common.exceptions import BusinessRuleViolationError

from .products import create_product, create_variant

TWO_PLACES = Decimal("0.01")


def bundles_in_use() -> str | None:
    count = ProductVariant.objects.filter(
        deleted_at__isnull=True, product__product_type=Product.ProductType.BUNDLE
    ).count()
    if count:
        return f"{count} bundle products still exist. Delete them first."
    return None


@dataclass(frozen=True)
class BundleComponent:
    component_variant: ProductVariant
    quantity: int


def _components_total(components: list[BundleComponent], *, attr: str) -> Decimal:
    return sum(
        (getattr(c.component_variant, attr) * c.quantity for c in components),
        Decimal("0"),
    ).quantize(TWO_PLACES)


def _validate_discount(*, price: Decimal, discount_price: Decimal | None) -> None:
    if discount_price is None:
        return
    if discount_price < 0:
        raise BusinessRuleViolationError(
            "Bundle discount price cannot be negative.", code="invalid_discount_price"
        )
    if discount_price >= price:
        raise BusinessRuleViolationError(
            "Bundle discount price must be below the bundle price.",
            code="invalid_discount_price",
        )


def _resolve_components(raw_components: list[dict]) -> list[BundleComponent]:
    """Resolve `{"component_variant_id": uuid, "quantity": n}` payloads into
    variants, rejecting unknown variants and non-positive quantities."""
    if not raw_components:
        raise BusinessRuleViolationError(
            "A bundle must have at least one component.", code="empty_bundle"
        )
    resolved: list[BundleComponent] = []
    for raw in raw_components:
        quantity = int(raw.get("quantity") or 0)
        if quantity <= 0:
            raise BusinessRuleViolationError(
                "Component quantity must be positive.", code="invalid_quantity"
            )
        variant = ProductVariant.objects.filter(
            id=raw["component_variant_id"], deleted_at__isnull=True
        ).first()
        if variant is None:
            raise BusinessRuleViolationError(
                "Bundle component not found.", code="component_not_found"
            )
        resolved.append(BundleComponent(component_variant=variant, quantity=quantity))
    return resolved


def _would_create_cycle(bundle_variant: ProductVariant, components: list[BundleComponent]) -> bool:
    """Reject bundles that directly or transitively contain themselves, so a
    bundle can never depend on its own stock."""
    stack = [c.component_variant for c in components]
    seen: set[UUID] = set()
    while stack:
        current = stack.pop()
        if current.id == bundle_variant.id:
            return True
        if current.id in seen:
            continue
        seen.add(current.id)
        stack.extend(item.component_variant for item in current.bundle_components.all())
    return False


def _sync_components(bundle_variant: ProductVariant, components: list[BundleComponent]) -> None:
    if _would_create_cycle(bundle_variant, components):
        raise BusinessRuleViolationError(
            "A bundle cannot contain itself as a component.",
            code="circular_bundle",
        )
    incoming = {str(c.component_variant.id): c.quantity for c in components}
    existing = {
        str(item.component_variant_id): item for item in bundle_variant.bundle_components.all()
    }
    for key, item in existing.items():
        if key not in incoming:
            item.delete()
        elif item.quantity != incoming[key]:
            item.quantity = incoming[key]
            item.save(update_fields=["quantity", "updated_at"])
    to_create = {key: qty for key, qty in incoming.items() if key not in existing}
    if to_create:
        BundleItem.objects.bulk_create(
            BundleItem(
                bundle_variant=bundle_variant,
                component_variant_id=key,
                quantity=qty,
            )
            for key, qty in to_create.items()
        )


@transaction.atomic
def create_bundle(
    *,
    category,
    name: str,
    sku: str = "",
    components: list[dict],
    price: Decimal | None = None,
    discount_price: Decimal | None = None,
    description: str = "",
    barcode: str = "",
    cost_price: Decimal | None = None,
    is_active: bool = True,
    actor=None,
) -> ProductVariant:
    require_feature(ModuleKey.CATALOG, "bundles")
    resolved = _resolve_components(components)
    if price is None:
        price = _components_total(resolved, attr="price")
    if cost_price is None:
        cost_price = _components_total(resolved, attr="cost_price")
    _validate_discount(price=price, discount_price=discount_price)

    product = create_product(
        category=category,
        name=name,
        description=description,
        product_type=Product.ProductType.BUNDLE,
    )
    variant = create_variant(
        product=product,
        sku=sku,
        price=price,
        cost_price=cost_price or Decimal("0"),
        discount_price=discount_price,
        barcode=barcode,
        actor=actor,
    )
    if not is_active:
        variant.is_active = False
        variant.save(update_fields=["is_active", "updated_at"])
    _sync_components(variant, resolved)
    log_action(
        actor=actor,
        action="bundle.created",
        target_type="ProductVariant",
        target_id=variant.id,
        metadata={"sku": variant.sku},
    )
    return variant


@transaction.atomic
def update_bundle(
    *,
    bundle_variant: ProductVariant,
    data: dict,
    components: list[dict] | None = None,
    actor=None,
) -> ProductVariant:
    _validate_discount(
        price=data.get("price", bundle_variant.price),
        discount_price=data.get("discount_price", bundle_variant.discount_price),
    )

    product_fields = {"name", "description", "category"}
    product_data = {k: v for k, v in data.items() if k in product_fields}
    if product_data:
        from .products import update_product

        update_product(product=bundle_variant.product, data=product_data)

    variant_fields = {"sku", "barcode", "cost_price", "price", "discount_price"}
    variant_data = {k: v for k, v in data.items() if k in variant_fields}
    if variant_data:
        from .products import update_variant

        update_variant(variant=bundle_variant, data=variant_data, actor=actor)

    if "is_active" in data:
        bundle_variant.is_active = bool(data["is_active"])
        bundle_variant.save(update_fields=["is_active", "updated_at"])

    resolved = _resolve_components(components) if components is not None else None
    if resolved is not None:
        _sync_components(bundle_variant, resolved)
        # Re-derive any total the caller didn't set explicitly from the new components.
        derived = {}
        if "price" not in data:
            derived["price"] = _components_total(resolved, attr="price")
        if "cost_price" not in data:
            derived["cost_price"] = _components_total(resolved, attr="cost_price")
        if derived:
            for field, value in derived.items():
                setattr(bundle_variant, field, value)
            bundle_variant.save(update_fields=[*derived, "updated_at"])

    log_action(
        actor=actor,
        action="bundle.updated",
        target_type="ProductVariant",
        target_id=bundle_variant.id,
        metadata={
            "fields": sorted(set(data) | ({"components"} if components is not None else set()))
        },
    )
    return bundle_variant


@transaction.atomic
def deactivate_bundle(*, bundle_variant: ProductVariant, actor=None) -> ProductVariant:
    from .products import deactivate_variant

    return deactivate_variant(variant=bundle_variant, actor=actor)


@transaction.atomic
def delete_bundle(*, bundle_variant: ProductVariant, actor=None) -> ProductVariant:
    from apps.common.services.soft_delete import soft_delete_instance

    return soft_delete_instance(bundle_variant, actor=actor)
