from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.procurement.models import PurchaseOrder, PurchaseOrderLine
from apps.procurement.selectors.kind import filter_by_kind


def purchase_orders_list(
    *,
    supplier=None,
    status: str | None = None,
    search: str | None = None,
    kind: str | None = None,
) -> QuerySet[PurchaseOrder]:
    queryset = (
        PurchaseOrder.objects.select_related("supplier")
        .prefetch_related(
            "lines__variant__product",
            "lines__variant__images",
            "lines__variant__product__images",
        )
        .filter(deleted_at__isnull=True)
    )
    if supplier is not None:
        queryset = queryset.filter(supplier=supplier)
    if status:
        queryset = queryset.filter(status=status)
    if search:
        queryset = queryset.filter(po_number__icontains=search)
    return filter_by_kind(queryset, kind).order_by("-order_date")


def get_purchase_order_by_id(po_id: str | UUID) -> PurchaseOrder | None:
    return (
        PurchaseOrder.objects.select_related("supplier")
        .prefetch_related(
            "lines__variant__product",
            "lines__variant__images",
            "lines__variant__product__images",
        )
        .filter(id=po_id, deleted_at__isnull=True)
        .first()
    )


def get_purchase_order_line(
    purchase_order: PurchaseOrder, line_id: str | UUID
) -> PurchaseOrderLine | None:
    return purchase_order.lines.select_related("variant__product").filter(id=line_id).first()


def get_purchase_order_for_document(po_id: str | UUID) -> PurchaseOrder | None:
    """Detail fetch that also walks lines to product, which the PDF prints."""
    return (
        PurchaseOrder.objects.select_related("supplier")
        .prefetch_related(
            "lines__variant__product",
            "lines__variant__images",
            "lines__variant__product__images",
        )
        .filter(id=po_id, deleted_at__isnull=True)
        .first()
    )
