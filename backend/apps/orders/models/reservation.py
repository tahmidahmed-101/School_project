from __future__ import annotations

from datetime import timedelta
from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel

from .sales_order import SalesOrderLine


def default_reservation_expiry():
    return timezone.now() + timedelta(hours=settings.STOCK_RESERVATION_TTL_HOURS)


class StockReservation(TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        RELEASED = "released", "Released"

    order_line = models.ForeignKey(
        SalesOrderLine, on_delete=models.CASCADE, related_name="reservations"
    )
    variant = models.ForeignKey(
        "catalog.ProductVariant", on_delete=models.PROTECT, related_name="stock_reservations"
    )
    # Where the units are held. Empty only on holds made before stock could sit
    # in more than one warehouse; those are in the default warehouse of their kind.
    warehouse = models.ForeignKey(
        "inventory.Warehouse",
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name="stock_reservations",
    )
    quantity = models.PositiveIntegerField()
    # Units of this hold that have left with a consignment. Shipping takes them
    # from the holds of their warehouse, so the rest is what is still held here.
    shipped_quantity = models.PositiveIntegerField(default=0)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.ACTIVE
    )
    expires_at = models.DateTimeField(default=default_reservation_expiry)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["variant"]),
            models.Index(fields=["status"]),
            models.Index(fields=["status", "expires_at"], name="reservation_status_exp_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.order_line_id}: {self.quantity} ({self.status})"

    @property
    def held_quantity(self) -> int:
        return max(self.quantity - self.shipped_quantity, 0)

    @property
    def is_expired(self) -> bool:
        return self.status == self.Status.ACTIVE and self.expires_at <= timezone.now()
