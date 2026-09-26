from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel

from .product import Product


class ProductReview(TimeStampedModel):
    customer: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="product_reviews"
    )
    product: models.ForeignKey = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="reviews"
    )
    rating: models.PositiveSmallIntegerField = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment: models.TextField = models.TextField(blank=True)
    is_verified_purchase: models.BooleanField = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["customer", "product"], name="uniq_product_review"),
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.product_id} ({self.rating})"
