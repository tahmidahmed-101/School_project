from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.business.constants import ModuleKey
from apps.common.models import TimeStampedModel


class ModuleSetting(TimeStampedModel):
    """Runtime on/off state for one module. Rows are seeded from
    MODULE_REGISTRY; the registry stays the source of truth for what a module
    is and what it depends on, this table only records the operator's choice."""

    key = models.CharField(max_length=64, unique=True, choices=ModuleKey.choices)
    # Vendor-sold, Django-admin only. Unlicensed reads as off everywhere.
    is_licensed = models.BooleanField(default=True)
    is_enabled = models.BooleanField(default=True)
    config = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["key"]

    def __str__(self) -> str:
        return f"{self.key}: {'on' if self.is_enabled else 'off'}"
