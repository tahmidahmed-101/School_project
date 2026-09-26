from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models.base import SoftDeleteModel


class Address(SoftDeleteModel):
    class AddressType(models.TextChoices):
        SHIPPING = "shipping", "Shipping"
        BILLING = "billing", "Billing"
        OTHER = "other", "Other"

    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="addresses"
    )
    address_type: models.CharField = models.CharField(
        max_length=16,
        choices=AddressType.choices,
        default=AddressType.SHIPPING,
    )
    full_name: models.CharField = models.CharField(max_length=150)
    phone: models.CharField = models.CharField(max_length=32)
    line1: models.CharField = models.CharField(max_length=255)
    line2: models.CharField = models.CharField(max_length=255, blank=True)
    # Checkout collects a single free-text address line; city/state are kept
    # blank-able for the orders placed before district/thana were removed.
    city: models.CharField = models.CharField(max_length=100, blank=True, default="")
    state: models.CharField = models.CharField(max_length=100, blank=True)
    postal_code: models.CharField = models.CharField(max_length=32)
    country: models.CharField = models.CharField(max_length=100)
    is_default: models.BooleanField = models.BooleanField(default=False)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "is_default"]),
            models.Index(fields=["user", "address_type"], name="addr_user_type_idx"),
            models.Index(fields=["user", "deleted_at"], name="addr_user_deleted_idx"),
        ]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user"],
                condition=models.Q(is_default=True, deleted_at__isnull=True),
                name="uniq_default_address_per_user",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.full_name}, {self.line1}"
