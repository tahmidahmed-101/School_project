from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.catalog.models import Category
from apps.common.models import FullAuditModel


class Supplier(FullAuditModel):
    name = models.CharField(max_length=200)
    kind = models.CharField(
        max_length=20, choices=Category.CategoryType.choices, default=Category.CategoryType.STOCK
    )
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=32, blank=True)
    payment_terms = models.CharField(max_length=100, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="supplier_del_name_idx")
        ]

    def __str__(self) -> str:
        return self.name
