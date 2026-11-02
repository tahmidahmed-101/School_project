from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .sales_order import SalesOrder, SalesOrderLine


class ReturnRMA(FullAuditModel):
    class Status(models.TextChoices):
        REQUESTED = "requested", "Requested"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        RECEIVED = "received", "Received"
        CLOSED = "closed", "Closed"

    rma_number = models.CharField(max_length=32, unique=True)
    order = models.ForeignKey(SalesOrder, on_delete=models.PROTECT, related_name="rmas")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.REQUESTED)
    reason = models.TextField(blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "status"], name="rma_del_status_idx")
        ]

    def __str__(self) -> str:
        return self.rma_number


class ReturnRMALine(TimeStampedModel):
    class Condition(models.TextChoices):
        SELLABLE = "sellable", "Sellable"
        DAMAGED = "damaged", "Damaged"

    rma = models.ForeignKey(ReturnRMA, on_delete=models.CASCADE, related_name="lines")
    order_line = models.ForeignKey(
        SalesOrderLine, on_delete=models.PROTECT, related_name="rma_lines"
    )
    quantity = models.PositiveIntegerField()
    condition = models.CharField(max_length=20, choices=Condition.choices, blank=True)

    def __str__(self) -> str:
        return f"{self.rma_id}: {self.order_line_id} x{self.quantity}"
