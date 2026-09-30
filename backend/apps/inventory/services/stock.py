from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from django.db import transaction

from apps.accounting.services.postings import post_stock_adjustment, post_stock_writeoff
from apps.audit.services.audit import log_action
from apps.catalog.models import ProductVariant
from apps.catalog.selectors.products import get_variant_by_id
from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.constants import IN_MOVEMENT_TYPES, OUT_MOVEMENT_TYPES, MovementType
from apps.inventory.models import StockItem, StockLedgerEntry, Warehouse
from apps.inventory.selectors.warehouse import get_default_warehouse, get_warehouse_by_id


def _get_warehouse(warehouse_id=None):
    if isinstance(warehouse_id, Warehouse):
        return warehouse_id
    if warehouse_id:
        wh = get_warehouse_by_id(warehouse_id)
        if wh is None:
            raise BusinessRuleViolationError("Warehouse not found.", code="warehouse_not_found")
        return wh
    return get_or_create_default_warehouse()


def get_or_create_default_warehouse():
    default = get_default_warehouse()
    if default:
        return default
    return Warehouse.objects.create(
        name="Main Warehouse",
        code="MAIN",
        is_default=True,
        is_active=True,
    )


def materialize_stock_items(*, variant=None, warehouse=None) -> int:
    """Create zero-quantity cached StockItem rows for every live variant that
    doesn't have one yet, so a freshly-created product (no movement history)
    still shows up in the Stock Levels list and can be intaken/adjusted.
    A variant with no ledger simply has 0 on hand, so materializing the row
    with defaults is a safe cache-fill. Returns how many rows were created."""
    warehouse = _get_warehouse(warehouse)
    variants = ProductVariant.objects.filter(deleted_at__isnull=True)
    if variant is not None:
        variants = variants.filter(pk=variant.pk)

    # Get variants that don't have a stock item for this warehouse
    existing_variant_ids = StockItem.objects.filter(warehouse=warehouse).values_list(
        "variant_id", flat=True
    )
    variants = variants.exclude(id__in=existing_variant_ids)

    rows = [StockItem(variant=v, warehouse=warehouse) for v in variants]
    if rows:
        StockItem.objects.bulk_create(rows)
    return len(rows)


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

    warehouse = _get_warehouse(warehouse)

    # Locked for the transaction so two concurrent movements against the same
    # variant+warehouse can't both read the same starting balance.
    stock_item, _ = StockItem.objects.select_for_update().get_or_create(
        variant=variant, warehouse=warehouse
    )

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

    warehouse = _get_warehouse(warehouse)

    stock_item, _ = StockItem.objects.select_for_update().get_or_create(
        variant=variant, warehouse=warehouse
    )
    if stock_item.available < quantity:
        raise BusinessRuleViolationError(
            "Not enough available stock to reserve.", code="insufficient_stock"
        )
    stock_item.quantity_reserved += quantity
    stock_item.save(update_fields=["quantity_reserved", "updated_at"])
    return stock_item


@transaction.atomic
def release_reservation(*, variant, warehouse=None, quantity: int) -> StockItem:
    """Release a previously reserved quantity — either because the order
    shipped (the ledger entry for that is posted separately by
    `record_movement`) or the reservation was cancelled."""
    if quantity <= 0:
        raise BusinessRuleViolationError("Quantity must be positive.", code="invalid_quantity")

    warehouse = _get_warehouse(warehouse)

    stock_item, _ = StockItem.objects.select_for_update().get_or_create(
        variant=variant, warehouse=warehouse
    )
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
) -> StockLedgerEntry:
    """Cycle-count correction: positive delta posts ADJUSTMENT_IN, negative
    posts ADJUSTMENT_OUT, plus the matching journal entry so the GL's
    inventory asset stays equal to physical valuation."""
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
def post_bulk_adjustments(*, items: list[dict], actor=None) -> list[dict]:
    """Apply many adjustments as one all-or-nothing batch.

    A partially applied cycle count is worse than a rejected one, so the first
    failing item rolls the whole batch back.
    """
    results = []
    for index, item in enumerate(items):
        variant = get_variant_by_id(item["variant_id"])
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
) -> StockLedgerEntry:
    """The Stock App's intake action: receive newly stocked product. Posts a
    PURCHASE_IN movement so the ledger stays the single source of truth for
    on-hand quantities."""
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
) -> StockLedgerEntry:
    """Confirm a stock loss (damaged / expired / stolen) with a WRITE_OFF
    ledger entry plus the shrinkage journal posting (Dr Inventory Shrinkage
    / Cr Inventory Asset, blueprint §8)."""
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