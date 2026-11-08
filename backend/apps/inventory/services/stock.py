from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from django.db import transaction

from apps.accounting.services.postings import post_stock_adjustment, post_stock_writeoff
from apps.audit.services.audit import log_action
from apps.catalog.models import Category, ProductVariant
from apps.catalog.selectors.products import get_variants_by_ids
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import IN_MOVEMENT_TYPES, OUT_MOVEMENT_TYPES, MovementType
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.warehouse import (
    active_warehouses,
    all_warehouses,
    get_or_create_default_warehouse,
    get_warehouse_by_id,
)


def ensure_variant_kind(variant, kind: str | None) -> None:
    """Refuse a stock write made from one half's screens against the other
    half's item. No `kind` means the caller did not say which half it is."""
    if kind is None or variant.product.category.category_type == kind:
        return
    label = Category.CategoryType(kind).label.lower()
    raise BusinessRuleViolationError(
        f"{variant.product.name} ({variant.sku}) is not a {label} item.",
        code="stock_kind_mismatch",
    )


def _resolve_warehouse(warehouse) -> Warehouse:
    if isinstance(warehouse, Warehouse):
        return warehouse
    found = get_warehouse_by_id(warehouse)
    if found is None:
        raise BusinessRuleViolationError("Warehouse not found.", code="warehouse_not_found")
    return found


def ensure_warehouse_kind(variant, warehouse: Warehouse) -> None:
    kind = variant.product.category.category_type
    if warehouse.kind == kind:
        return
    raise BusinessRuleViolationError(
        f"{variant.product.name} ({variant.sku}) cannot go into {warehouse.name}: "
        "the item and the warehouse are of different kinds.",
        code="warehouse_kind_mismatch",
    )


def warehouse_for_variant(variant, warehouse=None) -> Warehouse:
    if not warehouse:
        return get_or_create_default_warehouse()
    warehouse = _resolve_warehouse(warehouse)
    ensure_warehouse_kind(variant, warehouse)
    return warehouse


def _locked_stock_item(variant, warehouse) -> StockItem:
    stock_item, _ = StockItem.objects.select_for_update().get_or_create(
        variant=variant, warehouse=warehouse
    )
    return stock_item


@transaction.atomic
def set_stock_levels(
    *, stock_item: StockItem, reorder_point: int, target_stock_level: int
) -> StockItem:
    stock_item.reorder_point = reorder_point
    stock_item.target_stock_level = target_stock_level
    stock_item.save(update_fields=["reorder_point", "target_stock_level", "updated_at"])
    return stock_item


def materialize_stock_items(*, variant=None, warehouse=None) -> int:
    """Create zero-quantity cached StockItem rows for every live variant that
    doesn't have one yet, so a freshly-created product (no movement history)
    still shows up in the Stock Levels list and can be intaken/adjusted.
    A warehouse only gets rows for variants of its own kind; with no warehouse
    given, the default warehouse is filled. Returns how many rows were created."""
    if warehouse:
        warehouses = [_resolve_warehouse(warehouse)]
    else:
        warehouses = [get_or_create_default_warehouse()]

    rows = []
    for target in warehouses:
        variants = ProductVariant.objects.filter(
            deleted_at__isnull=True, product__category__category_type=target.kind
        )
        if variant is not None:
            variants = variants.filter(pk=variant.pk)
        variants = variants.exclude(
            id__in=StockItem.objects.filter(warehouse=target).values_list("variant_id", flat=True)
        )
        rows += [StockItem(variant=v, warehouse=target) for v in variants]
    if rows:
        StockItem.objects.bulk_create(rows)
    return len(rows)


@transaction.atomic
def lock_variant_stock(
    variant_ids, *, warehouse_ids=None, create_missing: bool = True
) -> list[StockItem]:
    """Row-lock every stock row of these variants in every warehouse (or only
    in `warehouse_ids`), for the rest of the transaction.

    Rows missing for a warehouse of the variant's kind are first created at
    zero (the same cache-fill as `materialize_stock_items`), so a concurrent first movement or
    reservation there blocks on the unique (variant, warehouse) row instead of
    slipping in unseen. Movements and reservations lock these same rows.
    Limiting it to the warehouses a caller touches, or `create_missing=False`
    for a caller that only reads what is there, keeps it from putting back
    empty records staff deleted.
    """
    variant_ids = list(variant_ids)
    kind_by_variant = dict(
        ProductVariant.objects.filter(id__in=variant_ids).values_list(
            "id", "product__category__category_type"
        )
    )
    warehouse_queryset = all_warehouses()
    if warehouse_ids is not None:
        warehouse_ids = list(warehouse_ids)
        warehouse_queryset = warehouse_queryset.filter(id__in=warehouse_ids)
    warehouses = list(warehouse_queryset.values_list("id", "kind"))
    existing = set(
        StockItem.objects.filter(variant_id__in=variant_ids).values_list(
            "variant_id", "warehouse_id"
        )
    )
    missing = [
        (variant_id, warehouse_id)
        for variant_id, kind in kind_by_variant.items()
        for warehouse_id, warehouse_kind in warehouses
        if warehouse_kind == kind and (variant_id, warehouse_id) not in existing
    ]
    if missing and create_missing:
        StockItem.objects.bulk_create(
            [
                StockItem(variant_id=variant_id, warehouse_id=warehouse_id)
                for variant_id, warehouse_id in missing
            ],
            ignore_conflicts=True,
        )
    rows = StockItem.objects.select_for_update().select_related("variant", "warehouse")
    rows = rows.filter(variant_id__in=variant_ids)
    if warehouse_ids is not None:
        rows = rows.filter(warehouse_id__in=warehouse_ids)
    return list(rows.order_by("pk"))


@transaction.atomic
def record_movement(
    *,
    variant,
    warehouse=None,
    movement_type: str,
    quantity: int,
    unit_cost: Decimal | None = None,
    reference_type: str = "",
    reference_id: UUID | None = None,
    notes: str = "",
    actor=None,
) -> StockLedgerEntry:
    """The single writer for stock. Every module that moves stock (Catalog's
    admin adjustments now; Procurement/Sales in later phases) calls this
    instead of touching StockItem directly, so the ledger is always the
    source of truth and the on-hand snapshot never drifts from it.
    """
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")
    if movement_type not in MovementType.values:
        raise BusinessRuleViolationError("Unknown movement type.", code="invalid_movement_type")

    warehouse = warehouse_for_variant(variant, warehouse)

    # Locked for the transaction so two concurrent movements against the same
    # variant+warehouse can't both read the same starting balance.
    stock_item = _locked_stock_item(variant, warehouse)

    if movement_type in IN_MOVEMENT_TYPES:
        if unit_cost is not None:
            old_qty = stock_item.quantity_on_hand
            new_qty = old_qty + quantity
            old_value = old_qty * stock_item.avg_cost
            received_value = quantity * unit_cost
            stock_item.avg_cost = (
                (old_value + received_value) / new_qty if new_qty else Decimal("0")
            )
        stock_item.quantity_on_hand += quantity
    elif movement_type in OUT_MOVEMENT_TYPES:
        if stock_item.quantity_on_hand < quantity:
            raise BusinessRuleViolationError(
                "Not enough stock on hand for this movement.", code="insufficient_stock"
            )
        # Units held for orders cannot leave under them: the hold is released
        # first (shipping does that itself), never overridden by a movement.
        if stock_item.available < quantity:
            raise BusinessRuleViolationError(
                f"{stock_item.quantity_reserved} of the {stock_item.quantity_on_hand} on hand "
                f"are reserved for orders, so only {stock_item.available} can be removed. "
                "Release the reservations first.",
                code="stock_reserved",
            )
        stock_item.quantity_on_hand -= quantity

    stock_item.save(update_fields=["quantity_on_hand", "avg_cost", "updated_at"])

    entry = StockLedgerEntry.objects.create(
        variant=variant,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=quantity,
        unit_cost=unit_cost,
        balance_after=stock_item.quantity_on_hand,
        reference_type=reference_type,
        reference_id=reference_id,
        notes=notes,
        created_by=actor,
    )
    log_action(
        actor=actor,
        action="stock.changed",
        target_type="ProductVariant",
        target_id=variant.id,
        metadata={
            "movement_type": movement_type,
            "quantity": quantity,
            "balance_after": entry.balance_after,
            "warehouse_id": str(warehouse.id),
        },
    )
    return entry


@transaction.atomic
def reserve_stock(*, variant, warehouse=None, quantity: int) -> StockItem:
    """Move quantity from Available to Reserved for a confirmed-but-unshipped
    order. No ledger entry — nothing has physically moved yet (blueprint
    §5 point 1)."""
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    warehouse = warehouse_for_variant(variant, warehouse)

    stock_item = _locked_stock_item(variant, warehouse)
    if stock_item.available < quantity:
        raise BusinessRuleViolationError(
            "Not enough available stock to reserve.", code="insufficient_stock"
        )
    stock_item.quantity_reserved += quantity
    stock_item.save(update_fields=["quantity_reserved", "updated_at"])
    return stock_item


def _sellable_rows(variant) -> list[StockItem]:
    """The variant's stock rows in warehouses that can sell, locked: active,
    not deleted and of the variant's own kind."""
    # A warehouse with no record holds none of it, so there is nothing to
    # create: holds only come out of stock that is already there.
    kind = variant.product.category.category_type
    return list(
        StockItem.objects.select_for_update()
        .select_related("warehouse")
        .filter(variant=variant, warehouse__in=active_warehouses().filter(kind=kind))
        .order_by("pk")
    )


@transaction.atomic
def reserve_stock_anywhere(*, variant, quantity: int, prefer=None) -> list[tuple[Warehouse, int]]:
    """Hold `quantity` units wherever they are available, as few warehouses
    as possible: the preferred warehouse first (where the units came from or
    were held before), then the default, then the fullest. A hold that no
    single warehouse can cover is split across several. Returns the
    (warehouse, quantity) parts, so each can be held and later shipped from
    where it really is. Refused whole if every warehouse together falls short."""
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")
    prefer_id = getattr(prefer, "id", prefer)
    rows = sorted(
        _sellable_rows(variant),
        key=lambda item: (
            item.warehouse_id != prefer_id,
            not item.warehouse.is_default,
            -item.available,
            item.warehouse.name,
        ),
    )
    if sum(max(item.available, 0) for item in rows) < quantity:
        raise BusinessRuleViolationError(
            "Not enough available stock to reserve.", code="insufficient_stock"
        )
    # Whole in one warehouse when one can take it, so the parcel ships from one place.
    whole = next((item for item in rows if item.available >= quantity), None)
    if whole is not None:
        rows = [whole]

    parts: list[tuple[Warehouse, int]] = []
    remaining = quantity
    for item in rows:
        take = min(remaining, item.available)
        if take <= 0:
            continue
        reserve_stock(variant=variant, warehouse=item.warehouse, quantity=take)
        parts.append((item.warehouse, take))
        remaining -= take
        if remaining == 0:
            break
    return parts


@transaction.atomic
def release_reservation(*, variant, warehouse=None, quantity: int) -> StockItem:
    """Release a previously reserved quantity — either because the order
    shipped (the ledger entry for that is posted separately by
    `record_movement`) or the reservation was cancelled."""
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    warehouse = warehouse_for_variant(variant, warehouse)

    stock_item = _locked_stock_item(variant, warehouse)
    if stock_item.quantity_reserved < quantity:
        raise BusinessRuleViolationError(
            "Cannot release more than is currently reserved.", code="over_release"
        )
    stock_item.quantity_reserved -= quantity
    stock_item.save(update_fields=["quantity_reserved", "updated_at"])
    return stock_item


@transaction.atomic
def post_adjustment(
    *,
    variant,
    warehouse=None,
    quantity_delta: int,
    unit_cost: Decimal | None = None,
    notes: str = "",
    actor=None,
    kind: str | None = None,
) -> StockLedgerEntry:
    """Cycle-count correction: positive delta posts ADJUSTMENT_IN, negative
    posts ADJUSTMENT_OUT, plus the matching journal entry so the GL's
    inventory asset stays equal to physical valuation."""
    ensure_variant_kind(variant, kind)
    if quantity_delta == 0:
        raise BusinessRuleViolationError(
            "Adjustment quantity cannot be zero.", code="invalid_quantity"
        )
    movement_type = (
        MovementType.ADJUSTMENT_IN if quantity_delta > 0 else MovementType.ADJUSTMENT_OUT
    )
    entry = record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=movement_type,
        quantity=abs(quantity_delta),
        unit_cost=unit_cost,
        reference_type="adjustment",
        notes=notes,
        actor=actor,
    )
    post_stock_adjustment(entry, unit_cost=unit_cost)
    return entry


@transaction.atomic
def post_bulk_adjustments(*, items: list[dict], actor=None, kind: str | None = None) -> list[dict]:
    """Apply many adjustments as one all-or-nothing batch.

    A partially applied cycle count is worse than a rejected one, so the first
    failing item rolls the whole batch back.
    """
    variants = {
        str(variant.id): variant
        for variant in get_variants_by_ids([item["variant_id"] for item in items]).select_related(
            "product__category"
        )
    }
    results = []
    for index, item in enumerate(items):
        variant = variants.get(str(item["variant_id"]))
        if variant is None:
            raise BusinessRuleViolationError(
                f"Variant not found for item {index}.", code="variant_not_found"
            )
        warehouse_id = item.get("warehouse_id")
        entry = post_adjustment(
            variant=variant,
            warehouse=warehouse_id,
            quantity_delta=item["quantity_delta"],
            unit_cost=item.get("unit_cost"),
            notes=item.get("notes", ""),
            actor=actor,
            kind=kind,
        )
        results.append({"index": index, "entry": entry})
    return results


def stock_intake(
    *,
    variant,
    warehouse=None,
    quantity: int,
    unit_cost: Decimal | None = None,
    notes: str = "",
    actor=None,
    kind: str | None = None,
) -> StockLedgerEntry:
    """The Stock App's intake action: receive newly stocked product. Posts a
    PURCHASE_IN movement so the ledger stays the single source of truth for
    on-hand quantities."""
    ensure_variant_kind(variant, kind)
    return record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.PURCHASE_IN,
        quantity=quantity,
        unit_cost=unit_cost,
        reference_type="stock_intake",
        notes=notes,
        actor=actor,
    )


@transaction.atomic
def write_off_stock(
    *,
    variant,
    warehouse=None,
    quantity: int,
    reason: str = "",
    actor=None,
    kind: str | None = None,
) -> StockLedgerEntry:
    """Confirm a stock loss (damaged / expired / stolen) with a WRITE_OFF
    ledger entry plus the shrinkage journal posting (Dr Inventory Shrinkage
    / Cr Inventory Asset, blueprint §8)."""
    ensure_variant_kind(variant, kind)
    entry = record_movement(
        variant=variant,
        warehouse=warehouse,
        movement_type=MovementType.WRITE_OFF,
        quantity=quantity,
        reference_type="write_off",
        notes=reason,
        actor=actor,
    )
    post_stock_writeoff(entry)
    return entry


@transaction.atomic
def delete_stock_item(*, stock_item: StockItem, actor=None) -> None:
    if stock_item.quantity_on_hand != 0 or stock_item.quantity_reserved != 0:
        raise BusinessRuleViolationError(
            "Stock item still holds quantity — zero it out first.", code="stock_item_in_use"
        )
    log_action(
        actor=actor,
        action="stock_item.deleted",
        target_type="StockItem",
        target_id=stock_item.id,
        metadata={
            "variant_id": str(stock_item.variant_id),
            "warehouse_id": str(stock_item.warehouse_id),
        },
    )
    stock_item.delete()
