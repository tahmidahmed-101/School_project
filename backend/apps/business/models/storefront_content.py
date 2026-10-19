from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.db.models import Q

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


# Which of several live popups the storefront shows: the newest, then the id,
# so two rows never tie.
PROMOTION_POPUP_ORDER = ("-created_at", "-id")


class PromotionPopup(TimeStampedModel):
    """A storefront popup: one image, and where clicking it goes. A `home`
    popup belongs to one catalog Sale and shows while that sale runs; a
    `preorder` popup has no sale (sales never touch pre-orders) and shows on
    the pre-order page. Either shows only while switched on. With no
    `link_url`, the storefront sends the shopper to the promotion's products."""

    image = models.ImageField(upload_to=_promotion_image_path)
    link_url = models.CharField(max_length=500, blank=True)
    placement = models.CharField(
        max_length=20, choices=HeroPlacement.choices[:2], default=HeroPlacement.HOME
    )
    sale = models.ForeignKey(
        "catalog.Sale",
        on_delete=models.CASCADE,
        related_name="promotion_popups",
        null=True,
        blank=True,
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = list(PROMOTION_POPUP_ORDER)
        constraints: ClassVar[list] = [
            # A shop popup is sale-led; a pre-order one never has a sale.
            models.CheckConstraint(
                condition=(
                    Q(placement=HeroPlacement.HOME, sale__isnull=False)
                    | Q(placement=HeroPlacement.PREORDER, sale__isnull=True)
                ),
                name="promotion_popup_sale_matches_placement",
            ),
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["placement", "is_active"], name="promotion_popup_live_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.get_placement_display()} popup"
