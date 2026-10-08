from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel
from apps.common.utils.files import unique_upload_path

from .category import Category


def _brand_image_path(instance: Brand, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="brands")


class Brand(FullAuditModel):
    name = models.CharField(max_length=150)
    kind = models.CharField(
        max_length=20, choices=Category.CategoryType.choices, default=Category.CategoryType.STOCK
    )
    slug = models.SlugField(max_length=170, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to=_brand_image_path, null=True, blank=True
    )

    class Meta:
        ordering: ClassVar[list] = ["name"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["name", "kind"], name="brand_name_kind_uniq"),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "is_active"], name="brand_del_active_idx"),
        ]

    def __str__(self) -> str:
        return self.name