from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.catalog.models import ProductVariant
from apps.common.models import TimeStampedModel

from .warehouse import Warehouse


class StockTransfer(TimeStampedModel):
    """Units moved from one warehouse to another of the same kind. The move
    itself is the TRANSFER_OUT / TRANSFER_IN pair on the stock ledger, both
    pointing back here; this row is what staff look the transfer up by."""

    transfer_number = models.CharField(max_length=32, unique=True)
    from_warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT, related_name="transfers_out"
    )
    to_warehouse = models.ForeignKey(
        Warehouse, on_delete=models.PROTECT, related_name="transfers_in"
    )
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

    def __str__(self) -> str:
        return self.transfer_number


class StockTransferLine(TimeStampedModel):
    transfer = models.ForeignKey(StockTransfer, on_delete=models.CASCADE, related_name="lines")
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.PROTECT, related_name="transfer_lines"
    )
    quantity = models.PositiveIntegerField()
    # The source warehouse's average cost at the moment of the move, carried
    # into the destination's average so the stock keeps its value.
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4)

    def __str__(self) -> str:
        return f"{self.transfer_id}: {self.variant_id} x{self.quantity}"
