from __future__ import annotations

from uuid import UUID

from django.db.models import Q, QuerySet

from apps.inventory.models import StockTransfer


def transfers_list(*, warehouse=None, variant=None, kind: str | None = None) -> QuerySet:
    queryset = StockTransfer.objects.select_related(
        "from_warehouse", "to_warehouse", "created_by"
    ).prefetch_related("lines__variant__product", "lines__variant__option_values")
    if warehouse is not None:
        queryset = queryset.filter(Q(from_warehouse=warehouse) | Q(to_warehouse=warehouse))
    if variant is not None:
        queryset = queryset.filter(lines__variant=variant).distinct()
    if kind:
        queryset = queryset.filter(from_warehouse__kind=kind)
    return queryset


def get_transfer_by_id(transfer_id: str | UUID) -> StockTransfer | None:
    return transfers_list().filter(id=transfer_id).first()
