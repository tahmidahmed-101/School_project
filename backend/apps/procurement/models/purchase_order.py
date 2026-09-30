from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .supplier import Supplier


class PurchaseOrder(FullAuditModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        RECEIVED = "received", "Received"
        CANCELLED = "cancelled", "Cancelled"

    po_number = models.CharField(max_length=32, unique=True)
    supplier = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="purchase_orders"
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    order_date = models.DateField()
    notes = models.TextField(blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-order_date"]
        indexes: ClassVar[list] = [
            models.Index(fields=["status"]),
            models.Index(fields=["deleted_at", "status"], name="po_del_status_idx"),
            models.Index(fields=["deleted_at", "supplier"], name="po_del_supplier_idx"),
        ]

    def __str__(self) -> str:
        return self.po_number


class PurchaseOrderLine(TimeStampedModel):
    purchase_order = models.ForeignKey(
        PurchaseOrder, on_delete=models.CASCADE, related_name="lines"
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant", on_delete=models.PROTECT, related_name="purchase_order_lines"
    )
    quantity_ordered = models.PositiveIntegerField()
    quantity_received = models.PositiveIntegerField(default=0)
    unit_cost = models.DecimalField(max_digits=12, decimal_places=4)

    class Meta:
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(quantity_ordered__gte=0),
                name="poline_qty_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.purchase_order.po_number}: {self.variant_id} x{self.quantity_ordered}"
