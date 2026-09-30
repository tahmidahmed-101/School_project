from __future__ import annotations

from typing import ClassVar

from django.core.exceptions import ValidationError
from django.db import models

from apps.common.models import TimeStampedModel

from .product import Product
from .variant import ProductVariant


class ProductImage(TimeStampedModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, null=True, blank=True, related_name="images"
    )
    variant = models.ForeignKey(
        ProductVariant, on_delete=models.CASCADE, null=True, blank=True, related_name="images"
    )
    url = models.CharField(max_length=500)
    alt_text = models.CharField(max_length=255, blank=True, default="")
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list] = ["sort_order"]
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=(
                    models.Q(product__isnull=False, variant__isnull=True)
                    | models.Q(product__isnull=True, variant__isnull=False)
                ),
                name="img_xor_product_variant",
            ),
        ]

    def __str__(self) -> str:
        return self.url

    def clean(self) -> None:
        if bool(self.product_id) == bool(self.variant_id):
            raise ValidationError("Set exactly one of product or variant.")
