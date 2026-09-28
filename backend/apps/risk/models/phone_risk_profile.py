from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.utils.phone import validate_bd_mobile


class PhoneRiskProfile(TimeStampedModel):
    """Delivery history aggregated per recipient phone number.

    COD fraud in this market is a phone number that orders repeatedly and
    refuses delivery, so the signal is per phone, not per account: the same
    number returns under a fresh account every time. Rebuilt from our own
    shipment outcomes whenever one settles.
    """

    phone_number: models.CharField = models.CharField(
        max_length=20, unique=True, db_index=True, validators=[validate_bd_mobile]
    )
    total_orders: models.IntegerField = models.IntegerField(default=0)
    delivered_count: models.IntegerField = models.IntegerField(default=0)
    returned_count: models.IntegerField = models.IntegerField(default=0)
    cancelled_count: models.IntegerField = models.IntegerField(default=0)
    success_rate: models.DecimalField = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal("0.00")
    )
    last_order_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)
    last_delivered_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)
    last_returned_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)
    recalculated_at: models.DateTimeField = models.DateTimeField(auto_now=True)

    class Meta:
        ordering: ClassVar[list] = ["-recalculated_at"]
        indexes: ClassVar[list] = [models.Index(fields=["success_rate", "total_orders"])]
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(success_rate__gte=0) & models.Q(success_rate__lte=100),
                name="phone_risk_profile_success_rate_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.phone_number} ({self.success_rate}% of {self.total_orders})"

    @property
    def settled_orders(self) -> int:
        """Orders with a final outcome; pending ones say nothing about risk."""
        return self.delivered_count + self.returned_count
