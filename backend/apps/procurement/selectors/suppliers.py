from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.procurement.models import Supplier


def suppliers_list(
    *, search: str | None = None, include_deleted: bool = False
) -> QuerySet[Supplier]:
    queryset = Supplier.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if search:
        queryset = queryset.filter(name__icontains=search)
    return queryset.order_by("name")


def get_supplier_by_id(
    supplier_id: str | UUID, *, include_deleted: bool = False
) -> Supplier | None:
    queryset = Supplier.objects.all()
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=supplier_id).first()
