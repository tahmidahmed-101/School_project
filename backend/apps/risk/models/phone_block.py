from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.utils.phone import validate_bd_mobile


class PhoneBlock(TimeStampedModel):
    """A phone number the merchant will not take a COD order from.

    Keyed on the normalised phone rather than a user: blocking an account
    achieves nothing when the next order arrives from a fresh signup with the
    same number, and most orders in this market have no account at all.

    A block never deletes itself: an automatic one is a suggestion the
    merchant can lift, and lifting it records who lifted it.
    """

    class Strength(models.TextChoices):
        ADVANCE_ONLY = "advance_only", "Advance payment only"
        BLOCKED = "blocked", "Refuse all orders"

    class Origin(models.TextChoices):
        MANUAL = "manual", "Added by staff"
        AUTOMATIC = "automatic", "Flagged by a rule"

    phone_number: models.CharField = models.CharField(
        max_length=20,
        unique=True,
        db_index=True,
        help_text="Normalised: 01XXXXXXXXX",
        validators=[validate_bd_mobile],
    )
    strength: models.CharField = models.CharField(
        max_length=20, choices=Strength.choices, default=Strength.ADVANCE_ONLY
    )
    origin: models.CharField = models.CharField(
        max_length=20, choices=Origin.choices, default=Origin.MANUAL
    )
    reason: models.TextField = models.TextField(help_text="Why. Shown to staff, never customers.")
    created_by: models.ForeignKey | None = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="phone_blocks_created",
    )
    lifted_at: models.DateTimeField | None = models.DateTimeField(
        null=True, blank=True, db_index=True
    )
    lifted_by: models.ForeignKey | None = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="phone_blocks_lifted",
    )
    lift_reason: models.TextField = models.TextField(blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [models.Index(fields=["strength", "lifted_at"])]

    def __str__(self) -> str:
        return f"{self.phone_number} ({self.get_strength_display()})"

    @property
    def is_active(self) -> bool:
        return self.lifted_at is None
