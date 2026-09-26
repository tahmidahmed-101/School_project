from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class TaxRate(FullAuditModel):
    name: models.CharField = models.CharField(max_length=100)
    rate_percent: models.DecimalField = models.DecimalField(max_digits=5, decimal_places=2)
    region: models.CharField = models.CharField(max_length=100, blank=True)
    is_default: models.BooleanField = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="taxrate_del_name_idx")
        ]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["is_default"],
                condition=models.Q(is_default=True, deleted_at__isnull=True),
                name="uniq_default_tax_rate",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.rate_percent}%)"
