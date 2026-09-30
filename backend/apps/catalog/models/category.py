from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel
from apps.common.utils.files import unique_upload_path


def _category_image_path(instance: Category, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="categories")


class Category(FullAuditModel):
    class CategoryType(models.TextChoices):
        STOCK = "stock", "Stock"
        PREORDER = "preorder", "Pre-order"

    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=170, unique=True)
    parent = models.ForeignKey(
        "self", on_delete=models.CASCADE, null=True, blank=True, related_name="children"
    )
    description = models.TextField(blank=True)
    image = models.ImageField(
        upload_to=_category_image_path, null=True, blank=True
    )
    # A subcategory always shares its parent's type (enforced in
    # apps.catalog.services.categories) — stored per row rather than derived by
    # walking the parent chain, so filtering by type stays a single indexed query.
    category_type = models.CharField(
        max_length=20, choices=CategoryType.choices, default=CategoryType.STOCK
    )

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "is_active"], name="cat_del_active_idx"),
            models.Index(
                fields=["category_type", "deleted_at", "is_active"], name="cat_type_del_active_idx"
            ),
        ]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name
