from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel
from apps.common.utils.files import unique_upload_path


def _hero_image_path(instance: HeroSlide, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="hero")


def _promotion_image_path(instance: PromotionPopup, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="promotions")


class HeroPlacement(models.TextChoices):
    HOME = "home", "Home"
    PREORDER = "preorder", "Pre-order"
    # Old rows only, until `split_both_placements` has run. Never written again.
    BOTH = "both", "Both"


WRITABLE_PLACEMENTS = (HeroPlacement.HOME.value, HeroPlacement.PREORDER.value)


class HeroSlide(TimeStampedModel):
    """One owner-editable storefront banner. `link_url` is a site path
    (`/shop?type=normal`) or a full URL."""

    image = models.ImageField(upload_to=_hero_image_path)
    alt_text = models.CharField(max_length=200, blank=True)
    tag_en = models.CharField(max_length=80, blank=True)
    tag_bn = models.CharField(max_length=80, blank=True)
    title_en = models.CharField(max_length=160, blank=True)
    title_bn = models.CharField(max_length=160, blank=True)
    link_url = models.CharField(max_length=500, blank=True)
    placement = models.CharField(
        max_length=20, choices=HeroPlacement.choices, default=HeroPlacement.HOME
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = ["sort_order", "created_at"]

    def __str__(self) -> str:
        return self.title_en or self.alt_text or str(self.id)


class PromoLine(TimeStampedModel):
    """One line of the storefront promo strip."""

    text_en = models.CharField(max_length=160)
    text_bn = models.CharField(max_length=160, blank=True)
    placement = models.CharField(
        max_length=20, choices=HeroPlacement.choices, default=HeroPlacement.HOME
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = ["sort_order", "created_at"]

    def __str__(self) -> str:
        return self.text_en


# Which of several live popups the storefront shows: the highest priority,
# then the newest, then the id, so two rows never tie.
PROMOTION_POPUP_ORDER = ("-priority", "-created_at", "-id")


class PromotionPopup(TimeStampedModel):
    """A storefront popup campaign: one image, when and where it shows, and
    where clicking it goes. Staff switch it on or off (`is_active`); one
    that is on shows between `starts_at` and `ends_at` (either may be
    open-ended), on its shop's pages, on desktop and mobile alike. Clicking it
    goes to its destination, if it has one. See `display_status` for the four
    states the dashboard shows."""

    class DisplayStatus(models.TextChoices):
        INACTIVE = "inactive", "Inactive"
        SCHEDULED = "scheduled", "Scheduled"
        ACTIVE = "active", "Active"
        EXPIRED = "expired", "Expired"

    class Shop(models.TextChoices):
        STOCK = "stock", "Stock"
        PREORDER = "preorder", "Pre-order"

    class Destination(models.TextChoices):
        NONE = "none", "No link"
        PRODUCT = "product", "Product"
        CATEGORY = "category", "Category"
        CAMPAIGN = "campaign", "Campaign page"
        URL = "url", "Custom URL"

    # Campaign information. `shop` is fixed once created: a stock popup shows
    # on the stock pages, a pre-order one on the pre-order pages.
    shop = models.CharField(max_length=10, choices=Shop.choices, default=Shop.STOCK)
    name = models.CharField(max_length=120)
    is_active = models.BooleanField(default=True)
    priority = models.PositiveSmallIntegerField(default=0)

    # Display schedule
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)

    # Destination, optional: with one, exactly the field that matches
    # `destination_type` is set; with `none` the image alone is the popup.
    image = models.ImageField(upload_to=_promotion_image_path)
    destination_type = models.CharField(
        max_length=10, choices=Destination.choices, default=Destination.NONE
    )
    product = models.ForeignKey(
        "catalog.Product",
        on_delete=models.SET_NULL,
        related_name="promotion_popups",
        null=True,
        blank=True,
    )
    category = models.ForeignKey(
        "catalog.Category",
        on_delete=models.SET_NULL,
        related_name="promotion_popups",
        null=True,
        blank=True,
    )
    # The campaign (catalog Sale) whose products the campaign page lists.
    sale = models.ForeignKey(
        "catalog.Sale",
        on_delete=models.SET_NULL,
        related_name="promotion_popups",
        null=True,
        blank=True,
    )
    link_url = models.CharField(max_length=500, blank=True)

    class Meta:
        ordering: ClassVar[list] = list(PROMOTION_POPUP_ORDER)
        indexes: ClassVar[list] = [
            models.Index(
                fields=["is_active", "starts_at", "ends_at"], name="promotion_popup_live_idx"
            ),
        ]

    def __str__(self) -> str:
        return self.name

    def display_status(self, now=None) -> str:
        """Inactive while switched off; one that is on is scheduled before its
        start, expired after its end, and active in between."""
        if not self.is_active:
            return self.DisplayStatus.INACTIVE
        now = now or timezone.now()
        if self.ends_at is not None and now >= self.ends_at:
            return self.DisplayStatus.EXPIRED
        if self.starts_at is not None and now < self.starts_at:
            return self.DisplayStatus.SCHEDULED
        return self.DisplayStatus.ACTIVE
