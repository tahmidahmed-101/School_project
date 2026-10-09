from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.common.params import KIND_PREORDER, KIND_STOCK
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


def default_warehouse(kind: str = KIND_STOCK) -> Warehouse | None:
    return active_warehouses().filter(is_default=True, kind=kind).first()


def default_warehouse_ids() -> list[UUID]:
    return list(active_warehouses().filter(is_default=True).values_list("id", flat=True))


NEW_DEFAULT_WAREHOUSE = {
    KIND_STOCK: {"name": "Main Warehouse", "code": "MAIN"},
    KIND_PREORDER: {"name": "Pre-order Warehouse", "code": "PREORDER"},
}


def get_or_create_default_warehouse(kind: str = KIND_STOCK) -> Warehouse:
    default = default_warehouse(kind)
    if default:
        return default
    return Warehouse.objects.create(
        kind=kind, is_default=True, is_active=True, **NEW_DEFAULT_WAREHOUSE[kind]
    )
