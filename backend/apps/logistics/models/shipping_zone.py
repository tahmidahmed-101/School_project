from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.catalog.models import Category
from apps.common.models import FullAuditModel


class ShippingZone(FullAuditModel):
    name = models.CharField(max_length=100)
    kind = models.CharField(
        max_length=20, choices=Category.CategoryType.choices, default=Category.CategoryType.STOCK
    )
    country_codes = models.JSONField(default=list, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["name", "kind"], name="shipzone_name_kind_uniq"),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="shipzone_del_name_idx")
        ]

    def __str__(self) -> str:
        return self.name
