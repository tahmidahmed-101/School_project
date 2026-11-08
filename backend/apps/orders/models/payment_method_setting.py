from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel
from apps.orders.constants import PaymentMethodKey

from .sales_order import SalesOrder


class PaymentMethodSetting(TimeStampedModel):
    """Whether the shop offers one payment method. The registry in
    `apps.orders.constants` stays the source of truth for what a method is;
    this table records only the operator's choice."""

    key = models.CharField(max_length=32, choices=PaymentMethodKey.choices)
    kind = models.CharField(
        max_length=20, choices=SalesOrder.OrderType.choices, default=SalesOrder.OrderType.STOCK
    )
    is_enabled = models.BooleanField(default=True)
    # The shop's own number or account for this method, shown to the customer.
    pay_to = models.CharField(max_length=200, blank=True, default="")

    class Meta:
        ordering: ClassVar[list] = ["key", "kind"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["key", "kind"], name="paymethod_key_kind_uniq"),
        ]

    def __str__(self) -> str:
        return f"{self.key} ({self.kind}): {'on' if self.is_enabled else 'off'}"
