from __future__ import annotations

from django.db.models import Exists, OuterRef, QuerySet

from apps.common.params import KIND_STOCK
from apps.procurement.models import PurchaseOrderLine

LINE_KIND = "variant__product__category__category_type"


def filter_by_kind(
    queryset: QuerySet, kind: str | None, *, purchase_order_field: str = "id"
) -> QuerySet:
    """With `kind=stock`, leave out rows whose purchase order holds an item
    outside the stock categories; a row with no purchase order counts as stock."""
    if not kind:
        return queryset
    other_line = PurchaseOrderLine.objects.filter(
        purchase_order_id=OuterRef(purchase_order_field)
    ).exclude(**{LINE_KIND: KIND_STOCK})
    return queryset.filter(~Exists(other_line))
