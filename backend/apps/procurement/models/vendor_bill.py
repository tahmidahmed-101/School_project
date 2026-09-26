from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .purchase_order import PurchaseOrder
from .supplier import Supplier


class VendorBill(FullAuditModel):
    class Status(models.TextChoices):
        UNPAID = "unpaid", "Unpaid"
        PAID = "paid", "Paid"
        OVERDUE = "overdue", "Overdue"
        VOID = "void", "Void"

    bill_number: models.CharField = models.CharField(max_length=32, unique=True)
    purchase_order: models.ForeignKey = models.ForeignKey(
        PurchaseOrder, on_delete=models.PROTECT, related_name="vendor_bills"
    )
    supplier: models.ForeignKey = models.ForeignKey(
        Supplier, on_delete=models.PROTECT, related_name="vendor_bills"
    )
    amount: models.DecimalField = models.DecimalField(max_digits=14, decimal_places=2)
    due_date: models.DateField = models.DateField()
    status: models.CharField = models.CharField(
        max_length=20, choices=Status.choices, default=Status.UNPAID
    )

    class Meta:
        ordering: ClassVar[list] = ["-due_date"]
        indexes: ClassVar[list] = [
            models.Index(fields=["status"]),
            models.Index(fields=["deleted_at", "status"], name="vbill_del_status_idx"),
            models.Index(fields=["deleted_at", "supplier"], name="vbill_del_supplier_idx"),
        ]

    def __str__(self) -> str:
        return self.bill_number


class VendorPayment(TimeStampedModel):
    vendor_bill: models.ForeignKey = models.ForeignKey(
        VendorBill, on_delete=models.PROTECT, related_name="payments"
    )
    amount: models.DecimalField = models.DecimalField(max_digits=14, decimal_places=2)
    paid_at: models.DateTimeField = models.DateTimeField()
    method: models.CharField = models.CharField(max_length=50, blank=True)
    reference: models.CharField = models.CharField(max_length=100, blank=True)

    def __str__(self) -> str:
        return f"{self.vendor_bill.bill_number}: {self.amount}"
