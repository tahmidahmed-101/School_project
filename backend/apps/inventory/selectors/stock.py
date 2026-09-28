from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.db.models import F, QuerySet

from apps.inventory.models import StockItem, StockLedgerEntry

from .warehouse import get_default_warehouse


def stock_items_list(
    *,
    variant=None,
    warehouse=None,
    low_stock_only: bool = False,
) -> QuerySet[StockItem]:
    queryset = (
        StockItem.objects.select_related("variant__product", "warehouse")
        .prefetch_related("variant__images", "variant__product__images")
        .filter(variant__deleted_at__isnull=True)
    )
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    if low_stock_only:
        queryset = queryset.annotate(
            low_stock_expr=F("quantity_on_hand") - F("quantity_reserved") - F("reorder_point")
        ).filter(low_stock_expr__lte=0)
    return queryset.order_by("warehouse__name", "variant__sku")


def get_stock_item(*, variant, warehouse=None) -> StockItem | None:
    queryset = StockItem.objects.filter(variant=variant)
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    else:
        default_wh = get_default_warehouse()
        if default_wh:
            queryset = queryset.filter(warehouse=default_wh)
    return queryset.first()


def get_stock_item_by_id(stock_item_id: str | UUID) -> StockItem | None:
    return (
        StockItem.objects.select_related("variant__product", "warehouse")
        .filter(id=stock_item_id)
        .first()
    )


def available_quantity_for_variant(variant, warehouse=None) -> int:
    """Available (on_hand - reserved) — the number shown as "in stock" on the
    public product browse API."""
    item = get_stock_item(variant=variant, warehouse=warehouse)
    return item.available if item else 0


def available_quantities_for_variants(
    variant_ids: Iterable[UUID], warehouse=None
) -> dict[UUID, int]:
    """Batch version of `available_quantity_for_variant` — one query for many
    variants, so callers building a variant table/list don't issue an N+1."""
    queryset = StockItem.objects.filter(variant_id__in=list(variant_ids))
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    else:
        default_wh = get_default_warehouse()
        if default_wh:
            queryset = queryset.filter(warehouse=default_wh)
    rows = queryset.values("variant_id", "quantity_on_hand", "quantity_reserved")
    return {row["variant_id"]: row["quantity_on_hand"] - row["quantity_reserved"] for row in rows}


def reorder_points_for_variants(variant_ids: Iterable[UUID], warehouse=None) -> dict[UUID, int]:
    queryset = StockItem.objects.filter(variant_id__in=list(variant_ids))
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    else:
        default_wh = get_default_warehouse()
        if default_wh:
            queryset = queryset.filter(warehouse=default_wh)
    rows = queryset.values("variant_id", "reorder_point")
    return {row["variant_id"]: row["reorder_point"] for row in rows}


def ledger_entries_list(
    *, variant=None, warehouse=None, movement_type: str | None = None
) -> QuerySet[StockLedgerEntry]:
    queryset = StockLedgerEntry.objects.select_related(
        "variant__product", "warehouse"
    ).prefetch_related("variant__images", "variant__product__images")
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    if movement_type:
        queryset = queryset.filter(movement_type=movement_type)
    return queryset.order_by("-created_at")