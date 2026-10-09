from __future__ import annotations

from django.db.models import Case, CharField, Exists, OuterRef, QuerySet, Value, When

from apps.common.params import KIND_PREORDER, KIND_STOCK
from apps.procurement.models import PurchaseOrder, PurchaseOrderLine

LINE_KIND = "variant__product__category__category_type"


def filter_by_kind(
    queryset: QuerySet, kind: str | None, *, purchase_order_field: str = "id"
) -> QuerySet:
    """Label every row with its `kind`; a row with no purchase order counts as stock."""
    preorder_line = PurchaseOrderLine.objects.filter(
        purchase_order_id=OuterRef(purchase_order_field), **{LINE_KIND: KIND_PREORDER}
    )
    queryset = queryset.annotate(
        kind=Case(
            When(Exists(preorder_line), then=Value(KIND_PREORDER)),
            default=Value(KIND_STOCK),
            output_field=CharField(),
        )
    )
    return queryset.filter(kind=kind) if kind else queryset


def purchase_order_kind(purchase_order: PurchaseOrder | None) -> str:
    if purchase_order is None:
        return KIND_STOCK
    is_preorder = purchase_order.lines.filter(**{LINE_KIND: KIND_PREORDER}).exists()
    return KIND_PREORDER if is_preorder else KIND_STOCK
