from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Referral(TimeStampedModel):
    """One friend's order placed with a referrer's code. `reward_amount` is
    fixed when the order is placed, so a later settings change cannot move it."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        REWARDED = "rewarded", "Rewarded"
        VOID = "void", "Void"

    referrer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="referrals_made"
    )
    order = models.OneToOneField(
        "orders.SalesOrder", on_delete=models.CASCADE, related_name="referral"
    )
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING)
    reward_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reward_coupon = models.OneToOneField(
        "orders.Coupon", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    rewarded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["referrer", "status"], name="referral_referrer_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.referrer_id} -> {self.order_id} ({self.status})"
