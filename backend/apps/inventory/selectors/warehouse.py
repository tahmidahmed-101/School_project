from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

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


def get_default_warehouse() -> Warehouse | None:
    return active_warehouses().filter(is_default=True).first()


def get_or_create_default_warehouse() -> Warehouse:
    """Get the default warehouse, creating one if none exists."""
    default = get_default_warehouse()
    if default:
        return default
    return Warehouse.objects.create(
        name="Main Warehouse",
        code="MAIN",
        is_default=True,
        is_active=True,
    )