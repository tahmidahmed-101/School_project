from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

from .product import Product


class WishlistItem(TimeStampedModel):
    customer: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="wishlist_items"
    )
    product: models.ForeignKey = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="wishlisted_by"
    )

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(fields=["customer", "product"], name="uniq_wishlist_item"),
        ]

    def __str__(self) -> str:
        return f"{self.customer_id}: {self.product_id}"
