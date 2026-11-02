from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import FullAuditModel


class Coupon(FullAuditModel):
    class DiscountType(models.TextChoices):
        PERCENTAGE = "percentage", "Percentage"
        FIXED = "fixed", "Fixed amount"

    code = models.CharField(max_length=32, unique=True)
    discount_type = models.CharField(
        max_length=20, choices=DiscountType.choices, default=DiscountType.PERCENTAGE
    )
    value = models.DecimalField(max_digits=12, decimal_places=2)
    min_order_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    usage_limit = models.PositiveIntegerField(
        null=True, blank=True, help_text="Leave blank for unlimited uses."
    )
    times_used = models.PositiveIntegerField(default=0)
    starts_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    per_customer_limit = models.PositiveIntegerField(
        null=True, blank=True, help_text="Uses allowed per customer. Leave blank for no limit."
    )
    max_discount_amount = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    # Both empty = the whole order. Otherwise only matching stock lines are discounted.
    categories = models.ManyToManyField("catalog.Category", blank=True, related_name="coupons")
    brands = models.ManyToManyField("catalog.Brand", blank=True, related_name="coupons")
    show_on_storefront = models.BooleanField(
        default=False,
        help_text=(
            "Advertise this code in the storefront's voucher strip. Leave off for private codes."
        ),
    )

    # Set on the shareable code of one customer's referral. Its discount is the
    # live dashboard setting, not `value`, and it stays out of the staff coupon list.
    referrer = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="referral_coupon",
    )

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["code", "deleted_at"], name="coupon_code_del_idx"),
        ]

    def __str__(self) -> str:
        return self.code
