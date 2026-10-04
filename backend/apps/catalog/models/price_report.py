from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

from .product import Product
from .variant import ProductVariant


class PriceIssueReport(TimeStampedModel):
    """A customer's report that a product looks mispriced. Staff-only: the
    reporter's claim is unverified and never shown on the storefront."""

    class Status(models.TextChoices):
        OPEN = "open", "Open"
        RESOLVED = "resolved", "Resolved"
        DISMISSED = "dismissed", "Dismissed"

    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="price_issue_reports"
    )
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="price_issue_reports"
    )
    variant = models.ForeignKey(
        ProductVariant,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="price_issue_reports",
    )
    expected_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    comment = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    staff_note = models.TextField(blank=True)
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="resolved_price_issue_reports",
    )
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["status", "created_at"], name="price_report_status_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.product_id} ({self.status})"
