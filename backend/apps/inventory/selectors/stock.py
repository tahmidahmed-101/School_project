from __future__ import annotations

from collections.abc import Iterable
from uuid import UUID

from django.db.models import F, QuerySet, Sum

from apps.catalog.models import Category
from apps.inventory.models import StockItem, StockLedgerEntry

from .warehouse import default_warehouse_ids


def _in_sellable_warehouses(queryset: QuerySet) -> QuerySet:
    """Rows in warehouses that can sell: active and not deleted."""
    return queryset.filter(warehouse__is_active=True, warehouse__deleted_at__isnull=True)


def _in_default_warehouse(queryset: QuerySet, warehouse) -> QuerySet:
    """The default warehouse's rows, one per variant."""
    if warehouse is not None:
        return queryset.filter(warehouse=warehouse)
    default_ids = default_warehouse_ids()
    return queryset.filter(warehouse_id__in=default_ids) if default_ids else queryset


def stock_items_list(
    *,
    variant=None,
    product=None,
    warehouse=None,
    low_stock_only: bool = False,
    kind: str | None = None,
) -> QuerySet[StockItem]:
    queryset = (
        StockItem.objects.select_related("variant__product", "warehouse")
        .prefetch_related("variant__images", "variant__product__images", "variant__option_values")
        .filter(variant__deleted_at__isnull=True)
    )
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if product is not None:
        queryset = queryset.filter(variant__product=product)
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    if kind:
        queryset = queryset.filter(variant__product__category__category_type=kind)
    if low_stock_only:
        # Low stock covers items of stock categories only.
        queryset = (
            queryset.filter(variant__product__category__category_type=Category.CategoryType.STOCK)
            .annotate(
                low_stock_expr=F("quantity_on_hand") - F("quantity_reserved") - F("reorder_point")
            )
            .filter(low_stock_expr__lte=0)
        )
    return queryset.order_by("warehouse__name", "variant__sku")


def get_stock_item(*, variant, warehouse=None) -> StockItem | None:
    queryset = StockItem.objects.filter(variant=variant)
    queryset = _in_default_warehouse(queryset, warehouse)
    return queryset.first()


def get_stock_item_by_id(stock_item_id: str | UUID) -> StockItem | None:
    return (
        StockItem.objects.select_related("variant__product", "warehouse")
        .filter(id=stock_item_id)
        .first()
    )


def available_quantity_for_variant(variant, warehouse=None) -> int:
    """Available (on_hand - reserved) — the number shown as "in stock" on the
    public product browse API. Without a warehouse, every warehouse that can
    sell counts: checkout holds stock wherever it is."""
    return available_quantities_for_variants([variant.id], warehouse).get(variant.id, 0)


def available_quantities_for_variants(
    variant_ids: Iterable[UUID], warehouse=None
) -> dict[UUID, int]:
    """Batch version of `available_quantity_for_variant` — one query for many
    variants, so callers building a variant table/list don't issue an N+1."""
    queryset = StockItem.objects.filter(variant_id__in=list(variant_ids))
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    else:
        queryset = _in_sellable_warehouses(queryset)
    rows = queryset.values("variant_id").annotate(
        on_hand=Sum("quantity_on_hand"), reserved=Sum("quantity_reserved")
    )
    return {row["variant_id"]: row["on_hand"] - row["reserved"] for row in rows}


def reorder_points_for_variants(variant_ids: Iterable[UUID], warehouse=None) -> dict[UUID, int]:
    """Each variant's reorder point, over the same warehouses as
    `available_quantities_for_variants` counts its stock: without a warehouse,
    the points of every selling warehouse added up, so the low-stock badge
    compares like with like."""
    queryset = StockItem.objects.filter(variant_id__in=list(variant_ids))
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    else:
        queryset = _in_sellable_warehouses(queryset)
    rows = queryset.values("variant_id").annotate(point=Sum("reorder_point"))
    return {row["variant_id"]: row["point"] for row in rows}


def ledger_entries_list(
    *, variant=None, warehouse=None, movement_type: str | None = None, kind: str | None = None
) -> QuerySet[StockLedgerEntry]:
    queryset = StockLedgerEntry.objects.select_related(
        "variant__product", "warehouse"
    ).prefetch_related("variant__images", "variant__product__images", "variant__option_values")
    if variant is not None:
        queryset = queryset.filter(variant=variant)
    if warehouse is not None:
        queryset = queryset.filter(warehouse=warehouse)
    if movement_type:
        queryset = queryset.filter(movement_type=movement_type)
    if kind:
        queryset = queryset.filter(variant__product__category__category_type=kind)
    return queryset.order_by("-created_at")
