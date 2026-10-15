from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.utils.files import unique_upload_path

from .product import Product


def _review_image_path(instance: ProductReviewImage, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="reviews")


class ProductReview(TimeStampedModel):
    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="product_reviews"
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(
        validators=[MinValueValidator(1), MaxValueValidator(5)]
    )
    comment = models.TextField(blank=True)
    is_verified_purchase = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["customer", "product"], name="uniq_product_review"),
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.product_id} ({self.rating})"


class ProductReviewImage(TimeStampedModel):
    review = models.ForeignKey(ProductReview, on_delete=models.CASCADE, related_name="images")
    image = models.ImageField(upload_to=_review_image_path)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list] = ["sort_order"]

    def __str__(self) -> str:
        return self.image.name
