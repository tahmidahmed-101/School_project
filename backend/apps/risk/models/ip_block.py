from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class IPBlock(TimeStampedModel):
    """An IP address refused at checkout.

    Checkout-time only, not a middleware-level ban: a bad rule here blocks
    one checkout attempt, not every request the address ever makes.
    ``expires_at`` null means indefinite.
    """

    ip_address = models.GenericIPAddressField(unique=True, db_index=True)
    reason = models.TextField(help_text="Why. Shown to staff, never customers.")
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="ip_blocks_created",
    )
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]

    def __str__(self) -> str:
        return self.ip_address

    @property
    def is_active(self) -> bool:
        return self.expires_at is None or self.expires_at > timezone.now()
