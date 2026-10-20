from __future__ import annotations

from django.db import transaction

from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_document_number
from apps.inventory.constants import MovementType
from apps.inventory.models import StockTransfer, StockTransferLine, Warehouse
from apps.inventory.services.stock import (
    _resolve_warehouse,
    ensure_warehouse_kind,
    lock_variant_stock,
    record_movement,
)

TRANSFER_REFERENCE = "stock_transfer"


def _transfer_number() -> str:
    number = generate_document_number("TRF")
    while StockTransfer.objects.filter(transfer_number=number).exists():
        number = generate_document_number("TRF")
    return number


def _ensure_route(source: Warehouse, destination: Warehouse) -> None:
    if source.pk == destination.pk:
        raise BusinessRuleViolationError("Pick two different warehouses.", code="same_warehouse")
    if source.kind != destination.kind:
        raise BusinessRuleViolationError(
            f"{source.name} is a {source.get_kind_display().lower()} warehouse and "
            f"{destination.name} a {destination.get_kind_display().lower()} one. Stock "
            "only moves between warehouses of the same kind.",
            code="warehouse_kind_mismatch",
        )
    if not destination.is_active:
        raise BusinessRuleViolationError(
            f"{destination.name} is switched off. Turn it on before moving stock into it.",
            code="warehouse_inactive",
        )


def _merged_lines(lines: list[dict]) -> dict:
    """One entry per variant, so [{A: 2}, {A: 3}] moves 5 and is checked as 5."""
    merged: dict = {}
    for line in lines:
        quantity = int(line["quantity"])
        if quantity <= 0:
            raise BusinessRuleViolationError(
                "Transfer quantity must be positive.", code="invalid_quantity"
            )
        variant = line["variant"]
        if variant.pk in merged:
            merged[variant.pk] = (variant, merged[variant.pk][1] + quantity)
        else:
            merged[variant.pk] = (variant, quantity)
    return merged


@transaction.atomic
def transfer_stock(
    *, from_warehouse, to_warehouse, lines: list[dict], notes: str = "", actor=None
) -> StockTransfer:
    """Move units between two warehouses of the same kind, all lines or none.

    Each line posts TRANSFER_OUT at the source and TRANSFER_IN at the
    destination at the source's average cost, so the destination's average
    absorbs the units at what they cost. Units reserved for orders stay put:
    only available stock moves. No journal entry: the stock is worth the same
    wherever it sits, so the inventory account does not change."""
    source = _resolve_warehouse(from_warehouse)
    destination = _resolve_warehouse(to_warehouse)
    _ensure_route(source, destination)
    if not lines:
        raise BusinessRuleViolationError("A transfer needs at least one line.", code="no_lines")
    merged = _merged_lines(lines)

    # Every warehouse row of these variants, locked in one consistent order,
    # so two transfers running opposite ways cannot deadlock.
    locked = {
        (item.variant_id, item.warehouse_id): item for item in lock_variant_stock(merged.keys())
    }

    transfer = StockTransfer.objects.create(
        transfer_number=_transfer_number(),
        from_warehouse=source,
        to_warehouse=destination,
        notes=notes.strip(),
        created_by=actor if getattr(actor, "pk", None) else None,
    )
    line_notes = f"Transfer {transfer.transfer_number}: {source.code} -> {destination.code}"
    for variant, quantity in merged.values():
        ensure_warehouse_kind(variant, source)
        source_item = locked.get((variant.pk, source.pk))
        if source_item is None or source_item.available < quantity:
            available = source_item.available if source_item else 0
            raise BusinessRuleViolationError(
                f"{source.name} has only {available} unit(s) of {variant.sku} free to move.",
                code="insufficient_stock",
            )
        unit_cost = source_item.avg_cost
        for warehouse, movement_type in (
            (source, MovementType.TRANSFER_OUT),
            (destination, MovementType.TRANSFER_IN),
        ):
            record_movement(
                variant=variant,
                warehouse=warehouse,
                movement_type=movement_type,
                quantity=quantity,
                unit_cost=unit_cost,
                reference_type=TRANSFER_REFERENCE,
                reference_id=transfer.id,
                notes=line_notes,
                actor=actor,
            )
        StockTransferLine.objects.create(
            transfer=transfer, variant=variant, quantity=quantity, unit_cost=unit_cost
        )

    log_action(
        actor=actor,
        action="stock.transferred",
        target_type="StockTransfer",
        target_id=transfer.id,
        metadata={
            "transfer_number": transfer.transfer_number,
            "from": source.code,
            "to": destination.code,
            "units": sum(quantity for _variant, quantity in merged.values()),
        },
    )
    return transfer
