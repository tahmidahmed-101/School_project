from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.common.exceptions import BusinessRuleViolationError
from apps.common.params import KIND_STOCK
from apps.inventory.models import Warehouse


def all_warehouses(*, include_deleted: bool = False) -> QuerySet[Warehouse]:
    queryset = Warehouse.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset


def active_warehouses() -> QuerySet[Warehouse]:
    return all_warehouses().filter(is_active=True)


def get_warehouse_by_id(
    warehouse_id: str | UUID, *, include_deleted: bool = False
) -> Warehouse | None:
    return all_warehouses(include_deleted=include_deleted).filter(id=warehouse_id).first()


def default_warehouse() -> Warehouse | None:
    return active_warehouses().filter(is_default=True, kind=KIND_STOCK).first()


def default_warehouse_ids() -> list[UUID]:
    return list(active_warehouses().filter(is_default=True).values_list("id", flat=True))


NEW_DEFAULT_WAREHOUSE = {"name": "Main Warehouse", "code": "MAIN"}


def get_or_create_default_warehouse() -> Warehouse:
    """The shop's active default warehouse, created on first use. A default that
    was switched off (possible before that was refused) is reported, not
    replaced: a second default would split the shop's stock between them."""
    default = default_warehouse()
    if default:
        return default
    switched_off = all_warehouses().filter(kind=KIND_STOCK, is_default=True).first()
    if switched_off is not None:
        raise BusinessRuleViolationError(
            f"The default warehouse, {switched_off.name}, is switched off. Switch it on, or "
            "make another warehouse the default.",
            code="default_warehouse_inactive",
        )
    spec = NEW_DEFAULT_WAREHOUSE
    # Codes are unique; never collide with one already taken.
    code, n = spec["code"], 2
    while Warehouse.objects.filter(code=code).exists():
        code, n = f"{spec['code']}-{n}", n + 1
    return Warehouse.objects.create(
        kind=KIND_STOCK, is_default=True, is_active=True, name=spec["name"], code=code
    )
