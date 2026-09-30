from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel
from apps.common.utils.files import unique_upload_path

from .category import Category


def _product_image_path(instance: Product, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="products")


class Product(FullAuditModel):
    class ProductType(models.TextChoices):
        SIMPLE = "simple", "Simple"
        VARIANT = "variant", "Variant"
        BUNDLE = "bundle", "Bundle"

    class Badge(models.TextChoices):
        NONE = "", "None"
        BESTSELLER = "bestseller", "Bestseller"
        POPULAR = "popular", "Popular"
        NEW = "new", "New"
        SALE = "sale", "Sale"
        LIMITED = "limited", "Limited"
        EXCLUSIVE = "exclusive", "Exclusive"

    category = models.ForeignKey(
        Category, on_delete=models.PROTECT, related_name="products"
    )
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    description = models.TextField(blank=True)
    tagline = models.CharField(max_length=300, blank=True, default="")
    product_type = models.CharField(
        max_length=20, choices=ProductType.choices, default=ProductType.SIMPLE
    )
    highlights = models.JSONField(default=list, blank=True)
    specs = models.JSONField(default=dict, blank=True)
    featured = models.BooleanField(default=False)
    trending = models.BooleanField(default=False)
    new_arrival = models.BooleanField(default=False)
    badge = models.CharField(
        max_length=20, choices=Badge.choices, default=Badge.NONE, blank=True
    )
    image = models.ImageField(
        upload_to=_product_image_path, null=True, blank=True
    )

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["product_type"]),
            models.Index(fields=["deleted_at", "category"], name="prod_del_cat_idx"),
            models.Index(fields=["deleted_at", "is_active"], name="prod_del_active_idx"),
            models.Index(fields=["featured", "deleted_at"], name="prod_feat_del_idx"),
            models.Index(fields=["trending", "deleted_at"], name="prod_trend_del_idx"),
            models.Index(fields=["new_arrival", "deleted_at"], name="prod_newarr_del_idx"),
        ]

    def __str__(self) -> str:
        return self.name
