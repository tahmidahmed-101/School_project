from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.common.models import FullAuditModel

from .brand import Brand
from .category import Category
from .product import Product


class Sale(FullAuditModel):
    """A percentage off list price for stock products, inside a time window.
    `is_active` is the staff on/off switch; the window decides the rest."""

    class AppliesTo(models.TextChoices):
        ALL = "all", "All stock products"
        CATEGORIES = "categories", "Categories"
        BRANDS = "brands", "Brands"
        PRODUCTS = "products", "Products"

    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        RUNNING = "running", "Running"
        ENDED = "ended", "Ended"
        OFF = "off", "Off"

    name = models.CharField(max_length=150)
    percent_off = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        validators=[MinValueValidator(Decimal("0.01")), MaxValueValidator(Decimal("99.99"))],
    )
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    applies_to = models.CharField(max_length=20, choices=AppliesTo.choices, default=AppliesTo.ALL)
    categories = models.ManyToManyField(Category, blank=True, related_name="sales")
    brands = models.ManyToManyField(Brand, blank=True, related_name="sales")
    products = models.ManyToManyField(Product, blank=True, related_name="sales")

    class Meta:
        ordering: ClassVar[list] = ["-starts_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "is_active", "ends_at"], name="sale_live_idx"),
        ]

    def __str__(self) -> str:
        return self.name

    @property
    def status(self) -> str:
        if not self.is_active:
            return self.Status.OFF
        now = timezone.now()
        if self.ends_at is not None and now >= self.ends_at:
            return self.Status.ENDED
        if now < self.starts_at:
            return self.Status.SCHEDULED
        return self.Status.RUNNING
