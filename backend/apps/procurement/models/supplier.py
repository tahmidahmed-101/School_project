from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class Supplier(FullAuditModel):
    name: models.CharField = models.CharField(max_length=200)
    contact_email: models.EmailField = models.EmailField(blank=True)
    phone: models.CharField = models.CharField(max_length=32, blank=True)
    payment_terms: models.CharField = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="supplier_del_name_idx")
        ]

    def __str__(self) -> str:
        return self.name
