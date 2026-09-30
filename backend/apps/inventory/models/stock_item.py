from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.catalog.models import ProductVariant
from apps.common.models import TimeStampedModel

from .warehouse import Warehouse


class StockItem(TimeStampedModel):
    """Cached on-hand/reserved snapshot per variant per warehouse, derived from
    StockLedgerEntry. Never edited by hand — only
    apps.inventory.services.stock.record_movement() writes to this. Rows are
    created lazily: record_movement() get_or_creates them, and the stock
    levels list materializes a zero row for any live variant that has none."""

    variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, related_name="stock_items"
    )
    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.CASCADE, related_name="stock_items"
    )
    quantity_on_hand = models.IntegerField(default=0)
    quantity_reserved = models.IntegerField(default=0)
    avg_cost = models.DecimalField(max_digits=12, decimal_places=4, default=0)
    reorder_point = models.IntegerField(default=10)
    target_stock_level = models.IntegerField(default=0)

    class Meta:
        indexes: ClassVar[list] = [
            # Low-stock predicate used by `stock_items_list(low_stock_only=True)`:
            # on_hand - reserved <= reorder_point. Index the same expression the
            # query filters on, so the planner can range-scan instead of reading
            # every StockItem row to evaluate the comparison.
            models.Index(
                models.F("quantity_on_hand")
                - models.F("quantity_reserved")
                - models.F("reorder_point"),
                name="stockitem_low_stock_expr_idx",
            ),
            models.Index(fields=["warehouse"], name="stockitem_warehouse_idx"),
        ]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["variant", "warehouse"], name="unique_stock_item_per_warehouse"
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_on_hand__gte=0),
                name="stockitem_qoh_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(quantity_reserved__gte=0),
                name="stockitem_reserved_non_negative",
            ),
            # Without this a manual stock_out/damage on a variant with live
            # reservations drives `available` negative and orphans them.
            models.CheckConstraint(
                condition=models.Q(quantity_on_hand__gte=models.F("quantity_reserved")),
                name="stockitem_reserved_within_on_hand",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.variant_id} @ {self.warehouse_id}"

    @property
    def available(self) -> int:
        return self.quantity_on_hand - self.quantity_reserved

    @property
    def is_below_reorder_point(self) -> bool:
        return self.available <= self.reorder_point