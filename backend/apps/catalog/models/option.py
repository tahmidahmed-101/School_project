from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

from apps.common.models import TimeStampedModel

from .product import Product


class ProductOption(TimeStampedModel):
    """One thing a product comes in, such as Size. At most three per product.

    Without a product it is a shop option: an attribute made on the Attributes page,
    which the product form offers. A product that picks one keeps its own copy.
    """

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="options", null=True, blank=True
    )
    name = models.CharField(max_length=50)
    position = models.PositiveIntegerField(default=0)
    # Shop options only: an inactive one is no longer offered when variants are generated.
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = ["position", "created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                "product", Lower("name"), name="unique_option_name_per_product"
            ),
            models.UniqueConstraint(
                Lower("name"), condition=Q(product__isnull=True), name="unique_shop_option_name"
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
