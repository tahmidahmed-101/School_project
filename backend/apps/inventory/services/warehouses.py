from __future__ import annotations

from django.db import transaction
from django.db.models import Q

from apps.common.exceptions import BusinessRuleViolationError
from apps.inventory.models import Warehouse
from apps.inventory.services.stock import materialize_stock_items


@transaction.atomic
def create_warehouse(*, data: dict, actor=None) -> Warehouse:
    warehouse = Warehouse.objects.create(created_by=actor, **data)
    materialize_stock_items(warehouse=warehouse)
    return warehouse


@transaction.atomic
def update_warehouse(*, warehouse: Warehouse, data: dict, actor=None) -> Warehouse:
    kind = data.get("kind", warehouse.kind)
    if kind != warehouse.kind and (
        warehouse.stock_items.exists() or warehouse.ledger_entries.exists()
    ):
        raise BusinessRuleViolationError(
            f"{warehouse.name} already holds {warehouse.get_kind_display().lower()} items, "
            "so it cannot be changed to the other kind. Add a new warehouse instead.",
            code="warehouse_kind_in_use",
        )
    for field, value in data.items():
        setattr(warehouse, field, value)
    warehouse.updated_by = actor
    warehouse.save(update_fields=[*data, "updated_at", "updated_by"])
    return warehouse


@transaction.atomic
def delete_warehouse(*, warehouse: Warehouse, actor=None) -> Warehouse:
    """A warehouse gets an empty stock row for every item of its kind the moment
    it is created, so having rows says nothing; holding units does. Empty rows
    go with it, so they never show up as low stock in a warehouse that is gone.
    Its ledger history stays, pointing at the soft-deleted warehouse."""
    warehouse = Warehouse.objects.select_for_update().get(pk=warehouse.pk)
    if warehouse.is_default:
        raise BusinessRuleViolationError(
            "Cannot delete the default warehouse.", code="cannot_delete_default_warehouse"
        )
    held = warehouse.stock_items.select_for_update().filter(
        Q(quantity_on_hand__gt=0) | Q(quantity_reserved__gt=0)
    )
    if held.exists():
        raise BusinessRuleViolationError(
            f"{warehouse.name} still holds stock for {held.count()} item(s) — "
            "move or zero them first.",
            code="warehouse_has_stock",
        )
    warehouse.stock_items.all().delete()
    warehouse.soft_delete(deleted_by=actor)
    return warehouse
