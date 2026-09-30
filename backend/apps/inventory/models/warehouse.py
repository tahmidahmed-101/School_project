from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class Warehouse(FullAuditModel):
    """Physical or logical storage location. Each variant has a StockItem
    per warehouse, and all movements are scoped to a warehouse."""

    name = models.CharField(max_length=150)
    code = models.CharField(max_length=32, unique=True)
    address = models.TextField(blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "is_active"], name="wh_del_active_idx"),
        ]

    def __str__(self) -> str:
        return self.name

    def save(self, *args, **kwargs):
        # Ensure only one default warehouse
        if self.is_default:
            Warehouse.objects.filter(is_default=True).exclude(pk=self.pk).update(
                is_default=False
            )
        super().save(*args, **kwargs)