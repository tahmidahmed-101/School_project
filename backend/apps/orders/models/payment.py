from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel
from apps.orders.constants import PaymentMethodKey

from .sales_order import SalesOrder


class Payment(TimeStampedModel):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        CAPTURED = "captured", "Captured"
        FAILED = "failed", "Failed"
        REFUNDED = "refunded", "Refunded"

    order: models.ForeignKey = models.ForeignKey(
        SalesOrder, on_delete=models.PROTECT, related_name="payments"
    )
    amount: models.DecimalField = models.DecimalField(max_digits=14, decimal_places=2)
    # Cumulative refunded total, so a payment can be refunded in instalments
    # without the running total having to be re-derived from journal entries.
    # `status` only reaches REFUNDED once this reaches `amount`.
    refunded_amount: models.DecimalField = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    method: models.CharField = models.CharField(
        max_length=32, choices=PaymentMethodKey.choices, default=PaymentMethodKey.MANUAL
    )
    status: models.CharField = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    gateway_reference: models.CharField = models.CharField(max_length=100, blank=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name="payment_amount_non_negative",
            ),
            models.CheckConstraint(
                condition=models.Q(refunded_amount__gte=0)
                & models.Q(refunded_amount__lte=models.F("amount")),
                name="payment_refunded_within_amount",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.order_id}: {self.amount} ({self.status})"
