from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class ShippingZone(FullAuditModel):
    name: models.CharField = models.CharField(max_length=100, unique=True)
    country_codes: models.JSONField = models.JSONField(default=list, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="shipzone_del_name_idx")
        ]

    def __str__(self) -> str:
        return self.name
