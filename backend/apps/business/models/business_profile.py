from __future__ import annotations

import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from apps.common.models import TimeStampedModel

SINGLETON_ID = uuid.UUID("00000000-0000-0000-0000-0000000b1720")


class BusinessProfile(TimeStampedModel):
    """The owner-editable business identity. Exactly one row, pinned to
    `SINGLETON_ID` so concurrent first-access cannot race a second one in."""

    name = models.CharField(max_length=200)
    legal_name = models.CharField(max_length=200, blank=True)
    tagline = models.CharField(max_length=200, blank=True)
    logo_url = models.TextField(blank=True)

    phone = models.CharField(max_length=50, blank=True)
    whatsapp = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    website = models.CharField(max_length=255, blank=True)
    google_maps_url = models.URLField(max_length=500, blank=True)
    opening_hours = models.CharField(max_length=200, blank=True)

    address_line = models.CharField(max_length=255, blank=True)
    district = models.CharField(max_length=100, blank=True)
    thana = models.CharField(max_length=100, blank=True)
    postcode = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=100, blank=True)

    currency_code = models.CharField(max_length=3, default="BDT")
    currency_symbol = models.CharField(max_length=8, default="৳")

    tax_id = models.CharField(max_length=50, blank=True)
    trade_licence_no = models.CharField(max_length=50, blank=True)

    facebook_url = models.URLField(max_length=500, blank=True)
    instagram_url = models.URLField(max_length=500, blank=True)
    tiktok_url = models.URLField(max_length=500, blank=True)
    youtube_url = models.URLField(max_length=500, blank=True)
    linkedin_url = models.URLField(max_length=500, blank=True)

    # Share of a pre-order's total taken before it is confirmed. 100 = full advance.
    preorder_deposit_percent = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("100"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("100"))],
    )

    # Terms the shopper accepts before placing a pre-order, in English and Bangla.
    # Both blank = none: the pre-order is confirmed without terms.
    preorder_terms_en = models.TextField(blank=True, default="")
    preorder_terms_bn = models.TextField(blank=True, default="")

    # Stock orders with a subtotal at or above this ship free. Blank or 0 = off.
    free_delivery_min_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0"))],
    )

    # One reminder SMS to a shopper who left a cart; every message costs money.
    cart_recovery_enabled = models.BooleanField(default=False)

    about_en = models.TextField(blank=True)
    about_bn = models.TextField(blank=True)

    class Meta:
        verbose_name = "Business profile"
        verbose_name_plural = "Business profile"

    def __str__(self) -> str:
        return self.name

    @property
    def formatted_address(self) -> str:
        parts = [self.address_line, self.thana, self.district, self.postcode, self.country]
        return ", ".join(part.strip() for part in parts if part and part.strip())
