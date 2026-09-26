from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .purchase_order import PurchaseOrder, PurchaseOrderLine


class GoodsReceiptNote(FullAuditModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        QC_PASS = "qc_pass", "QC pass"
        QC_REJECT = "qc_reject", "QC reject"

    purchase_order: models.ForeignKey = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, related_name="goods_receipts"
    )
    received_date: models.DateField = models.DateField()
    received_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    status: models.CharField = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )

    class Meta:
        ordering: ClassVar[list] = ["-received_date"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "purchase_order"], name="grn_del_po_idx"),
        ]

    def __str__(self) -> str:
        return f"GRN for {self.purchase_order.po_number}"


class GRNLine(TimeStampedModel):
    class Condition(models.TextChoices):
        ACCEPTED = "accepted", "Accepted"
        REJECTED = "rejected", "Rejected"

    goods_receipt: models.ForeignKey = models.ForeignKey(
        GoodsReceiptNote, on_delete=models.CASCADE, related_name="lines"
    )
    purchase_order_line: models.ForeignKey = models.ForeignKey(
        PurchaseOrderLine, on_delete=models.PROTECT, related_name="grn_lines"
    )
    quantity_received: models.PositiveIntegerField = models.PositiveIntegerField()
    condition: models.CharField = models.CharField(max_length=20, choices=Condition.choices)

    def __str__(self) -> str:
        return f"{self.goods_receipt_id}: {self.purchase_order_line_id} x{self.quantity_received}"
