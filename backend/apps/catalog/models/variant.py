from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.db import models
from django.utils import timezone

from apps.common.models import FullAuditModel
from apps.orders.services.carts import get_preordered_quantity

from .product import Product


class ProductVariant(FullAuditModel):
    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="variants"
    )
    sku = models.CharField(max_length=64, unique=True)
    barcode = models.CharField(max_length=64, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(
        max_digits=12, decimal_places=2, default=0
    )
    discount_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    weight = models.DecimalField(
        max_digits=10, decimal_places=3, null=True, blank=True
    )
    color = models.CharField(max_length=50, blank=True)
    size = models.CharField(max_length=50, blank=True)

    # Wholesale fields
    wholesale_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    show_wholesale_price = models.BooleanField(default=False)

    # Pre-order fields
    is_preorder_enabled = models.BooleanField(default=False)
    preorder_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True
    )
    preorder_start_date = models.DateTimeField(
        null=True, blank=True
    )
    preorder_end_date = models.DateTimeField(
        null=True, blank=True
    )
    release_date = models.DateTimeField(
        null=True, blank=True
    )
    preorder_stock_limit = models.PositiveIntegerField(
        null=True, blank=True,
        help_text="Maximum quantity available for pre-order. Leave blank for no limit."
    )

    class Meta:
        ordering: ClassVar[list] = ["sku"]
        indexes: ClassVar[list] = [
            models.Index(fields=["product", "deleted_at"], name="variant_prod_del_idx"),
            models.Index(fields=["is_preorder_enabled", "deleted_at"], name="variant_preorder_idx"),
            models.Index(
                fields=["preorder_start_date", "preorder_end_date"],
                name="variant_preorder_dates_idx"
            ),
        ]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["product", "color", "size"],
                condition=models.Q(deleted_at__isnull=True),
                name="unique_live_variant_combo",
            )
        ]

    @property
    def is_preorder_kind(self) -> bool:
        category = self.product.category
        return category.category_type == category.CategoryType.PREORDER

    @property
    def is_preorder_active(self) -> bool:
        """Open for ordering now. Only a variant in a pre-order category can be."""
        if not self.is_preorder_enabled or not self.is_preorder_kind:
            return False
        if self.preorder_start_date is None or self.preorder_end_date is None:
            return False
        now = timezone.now()
        return self.preorder_start_date <= now <= self.preorder_end_date

    def _get_preordered_quantity(self) -> int:
        """Get total pre-ordered quantity for this variant across all non-cancelled orders."""
        return get_preordered_quantity(self)

    @property
    def can_preorder(self) -> bool:
        if not self.is_preorder_active:
            return False
        if self.preorder_stock_limit is not None:
            preordered = self._get_preordered_quantity()
            return preordered < self.preorder_stock_limit
        return True

    @property
    def is_preorder_upcoming(self) -> bool:
        """A pre-order variant that is not open yet, or has no window set up."""
        if not self.is_preorder_kind:
            return False
        if not self.is_preorder_enabled:
            return True
        if self.preorder_start_date is None or self.preorder_end_date is None:
            return True
        return timezone.now() < self.preorder_start_date

    @property
    def is_preorder_closed(self) -> bool:
        """A pre-order variant whose ordering window has ended. It stays a
        pre-order item and cannot be bought."""
        return (
            self.is_preorder_kind
            and not self.is_preorder_active
            and not self.is_preorder_upcoming
        )

    @property
    def effective_price(self) -> Decimal:
        """What the customer actually pays: the lowest of list price, discount
        price and, while pre-order is open, pre-order price. A discount at or
        above list price is ignored, so a typo can't raise the charged amount."""
        candidates = [self.price]
        if self.discount_price is not None:
            candidates.append(self.discount_price)
        if self.is_preorder_active and self.preorder_price is not None:
            candidates.append(self.preorder_price)
        return min(candidates)

    @property
    def display_price(self) -> Decimal:
        """Price to display to customers (same as effective_price for storefront)."""
        return self.effective_price

    @property
    def is_preorder_price_applied(self) -> bool:
        return (
            self.is_preorder_active
            and self.preorder_price is not None
            and self.preorder_price < self.price
            and self.preorder_price == self.effective_price
        )

    def clean(self) -> None:
        from django.core.exceptions import ValidationError

        super().clean()

        if self.is_preorder_enabled:
            if self.preorder_price is not None and self.preorder_price >= self.price:
                raise ValidationError(
                    {"preorder_price": "Pre-order price must be lower than the normal price."}
                )

            if (
                self.preorder_start_date
                and self.preorder_end_date
                and self.preorder_start_date >= self.preorder_end_date
            ):
                raise ValidationError(
                    {"preorder_end_date": "Pre-order end date must be after start date."}
                )

            if (
                self.preorder_end_date
                and self.release_date
                and self.preorder_end_date > self.release_date
            ):
                raise ValidationError(
                    {"release_date": "Release date must be on or after pre-order end date."}
                )

    def __str__(self) -> str:
        return self.sku
