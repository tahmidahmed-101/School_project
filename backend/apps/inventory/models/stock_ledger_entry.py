from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.catalog.models import ProductVariant
from apps.common.models import UUIDModel
from apps.inventory.constants import MovementType

from .warehouse import Warehouse


class StockLedgerEntry(UUIDModel):
    """Append-only record of every stock movement. Nothing edits or deletes
    these rows — StockItem is a cache derived from summing this ledger."""

    created_at = models.DateTimeField(auto_now_add=True)
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT, related_name="ledger_entries"
    )
    movement_type = models.CharField(max_length=20, choices=MovementType.choices)
    quantity = models.PositiveIntegerField()
    unit_cost = models.DecimalField(
        max_digits=12, decimal_places=4, null=True, blank=True
    )
    balance_after = models.IntegerField()
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.UUIDField(null=True, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["variant", "warehouse"], name="sled_variant_wh_idx"),
            models.Index(fields=["movement_type"]),
            models.Index(fields=["reference_type", "reference_id"]),
            models.Index(fields=["created_at"]),
        ]

    def __str__(self) -> str:
        return f"{self.movement_type} {self.quantity} {self.variant_id} @ {self.warehouse_id}"