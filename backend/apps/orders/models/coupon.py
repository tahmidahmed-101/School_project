from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class Coupon(FullAuditModel):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed amount"

    code: models.CharField = models.CharField(max_length=32, unique=True)
    discount_type: models.CharField = models.CharField(
        max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE
    )
    value: models.DecimalField = models.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount: models.DecimalField = models.DecimalField(
        max_digits=14, decimal_places=2, default=0
    )
    usage_limit: models.PositiveIntegerField | None = models.PositiveIntegerField(
        null=True, blank=True, help_text="Leave blank for unlimited uses."
    )
    times_used: models.PositiveIntegerField = models.PositiveIntegerField(default=0)
    expires_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["code", "deleted_at"], name="coupon_code_del_idx"),
        ]

    def __str__(self) -> str:
        return self.code
