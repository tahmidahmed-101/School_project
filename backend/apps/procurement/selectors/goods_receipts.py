from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.procurement.models import GoodsReceiptNote
from apps.procurement.selectors.kind import filter_by_kind


def goods_receipts_list(
    *, purchase_order=None, kind: str | None = None
) -> QuerySet[GoodsReceiptNote]:
    queryset = (
        GoodsReceiptNote.objects.select_related("purchase_order")
        .prefetch_related("lines")
        .filter(deleted_at__isnull=True)
    )
    if purchase_order is not None:
        queryset = queryset.filter(purchase_order=purchase_order)
    queryset = filter_by_kind(queryset, kind, purchase_order_field="purchase_order_id")
    return queryset.order_by("-received_date")


def get_goods_receipt_by_id(grn_id: str | UUID) -> GoodsReceiptNote | None:
    return (
        GoodsReceiptNote.objects.select_related("purchase_order")
        .prefetch_related("lines")
        .filter(id=grn_id, deleted_at__isnull=True)
        .first()
    )
