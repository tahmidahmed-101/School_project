from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.orders.models import ReturnRMA


def rmas_list(*, order=None, status: str | None = None) -> QuerySet[ReturnRMA]:
    queryset = (
        ReturnRMA.objects.select_related("order")
        .prefetch_related("lines")
        .filter(deleted_at__isnull=True)
    )
    if order is not None:
        queryset = queryset.filter(order=order)
    if status:
        queryset = queryset.filter(status=status)
    return queryset.order_by("-created_at")


def get_rma_by_id(rma_id: str | UUID) -> ReturnRMA | None:
    return (
        ReturnRMA.objects.prefetch_related("lines")
        .filter(id=rma_id, deleted_at__isnull=True)
        .first()
    )
