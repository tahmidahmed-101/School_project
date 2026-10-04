from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

from .product import Product


class ProductQuestion(TimeStampedModel):
    """A customer's pre-purchase question. Private until staff both answer it
    and publish it — an unanswered question on a product page reads as the
    store ignoring its customers, and the raw text has not been moderated."""

    customer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="product_questions"
    )
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="questions")
    question = models.TextField()
    answer = models.TextField(blank=True)
    answered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="answered_product_questions",
    )
    answered_at = models.DateTimeField(null=True, blank=True)
    is_published = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["product", "is_published"], name="question_prod_pub_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.product_id}: {self.question[:40]}"
