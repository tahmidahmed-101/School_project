from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.db.models.functions import Lower

from apps.common.models import TimeStampedModel

from .product import Product


class ProductOption(TimeStampedModel):
    """One thing a product comes in, such as Size. At most three per product."""

    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="options")
    name = models.CharField(max_length=50)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list] = ["position", "created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                "product", Lower("name"), name="unique_option_name_per_product"
            ),
        ]

    def __str__(self) -> str:
        return self.name


class ProductOptionValue(TimeStampedModel):
    option = models.ForeignKey(ProductOption, on_delete=models.CASCADE, related_name="values")
    value = models.CharField(max_length=50)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list] = ["position", "created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                "option", Lower("value"), name="unique_option_value_per_option"
            ),
        ]

    def __str__(self) -> str:
        return self.value
