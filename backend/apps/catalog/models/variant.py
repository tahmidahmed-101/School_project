from __future__ import annotations

from decimal import Decimal
from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel

from .product import Product


class ProductVariant(FullAuditModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name="variants")
    sku = models.CharField(max_length=64, unique=True)
    barcode = models.CharField(max_length=64, blank=True)
    price = models.DecimalField(max_digits=12, decimal_places=2)
    cost_price = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    # Legacy text, read only by the transition rule in selectors/options.py.
    color = models.CharField(max_length=50, blank=True)
    size = models.CharField(max_length=50, blank=True)
    option_values = models.ManyToManyField(
        "catalog.ProductOptionValue", blank=True, related_name="variants"
    )
    title = models.CharField(max_length=160, blank=True, default="")

    # Wholesale fields
    wholesale_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    show_wholesale_price = models.BooleanField(default=False)

    class Meta:
        ordering: ClassVar[list] = ["sku"]
        indexes: ClassVar[list] = [
            models.Index(fields=["product", "deleted_at"], name="variant_prod_del_idx"),
        ]

    def _sale_offer(self) -> tuple:
        """(sale, sale price) when a running sale undercuts list and discount
        price, else (None, None)."""
        from apps.catalog.selectors.sales import PRIMED_SALES_ATTR, best_sale_for

        sale = best_sale_for(self.product, getattr(self, PRIMED_SALES_ATTR, None))
        if sale is None:
            return None, None
        sale_price = sale.price_for(self.price)
        other_prices = [self.price]
        if self.discount_price is not None:
            other_prices.append(self.discount_price)
        if sale_price >= min(other_prices):
            return None, None
        return sale, sale_price

    @property
    def applied_sale(self):
        return self._sale_offer()[0]

    @property
    def sale_price(self) -> Decimal | None:
        return self._sale_offer()[1]

    @property
    def effective_price(self) -> Decimal:
        """What the customer actually pays: the lowest of list price, discount
        price and running sale price. A discount at or above list price is
        ignored, so a typo can't raise the charged amount."""
        candidates = [self.price]
        if self.discount_price is not None:
            candidates.append(self.discount_price)
        sale_price = self.sale_price
        if sale_price is not None:
            candidates.append(sale_price)
        return min(candidates)

    @property
    def display_price(self) -> Decimal:
        """Price to display to customers (same as effective_price for storefront)."""
        return self.effective_price

    def __str__(self) -> str:
        return self.sku
