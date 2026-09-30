from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class Carrier(FullAuditModel):
    class Provider(models.TextChoices):
        PATHAO = "pathao", "Pathao"
        STEADFAST = "steadfast", "Steadfast"
        REDX = "redx", "RedX"
        MANUAL = "manual", "Manual / Other"

    name = models.CharField(max_length=100, unique=True)
    code = models.CharField(
        max_length=30, choices=Provider.choices, default=Provider.MANUAL, blank=True
    )
    phone = models.CharField(max_length=32, blank=True)
    contact_email = models.EmailField(blank=True)
    api_base_url = models.URLField(blank=True)
    api_key = models.CharField(max_length=255, blank=True)
    api_secret = models.CharField(max_length=255, blank=True)
    webhook_secret = models.CharField(max_length=255, blank=True)
    is_integration_enabled = models.BooleanField(default=False)
    # Provider-specific settings the shared credential columns can't hold —
    # Pathao's store_id/username/password, RedX's pickup_store_id, etc.
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="carrier_del_name_idx")
        ]

    def __str__(self) -> str:
        return self.name
