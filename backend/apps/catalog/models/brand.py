from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel
from apps.common.utils.files import unique_upload_path


def _brand_image_path(instance: Brand, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="brands")


class Brand(FullAuditModel):
    name = models.CharField(max_length=150, unique=True)
    slug = models.SlugField(max_length=170, unique=True)
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to=_brand_image_path, null=True, blank=True
    )

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "is_active"], name="brand_del_active_idx"),
        ]

    def __str__(self) -> str:
        return self.name