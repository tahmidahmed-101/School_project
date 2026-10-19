from __future__ import annotations

from typing import ClassVar

from django.db import models
from django.db.models import F, Q

from apps.common.models import TimeStampedModel, UUIDModel
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


# Which of several eligible popups the storefront shows: the highest priority,
# then the one that started most recently, then the newest, then the id, so
# two rows never tie.
PROMOTION_POPUP_ORDER = ("-priority", "-starts_at", "-created_at", "-id")


class PromotionPopup(TimeStampedModel):
    """A storefront popup. A `home` popup belongs to one catalog Sale: the
    percent, sale window and prices all come from `sale`, and it shows while
    that sale runs and still sets the featured products' prices. A `preorder`
    popup has no sale (sales never touch pre-orders) and features pre-order
    products open for ordering. Either shows only while switched on and
    inside its own window."""

    name = models.CharField(max_length=150, help_text="Dashboard label; never shown to shoppers.")
    title_en = models.CharField(max_length=160)
    title_bn = models.CharField(max_length=160, blank=True)
    body_en = models.CharField(max_length=500, blank=True)
    body_bn = models.CharField(max_length=500, blank=True)
    cta_label_en = models.CharField(max_length=60, blank=True)
    cta_label_bn = models.CharField(max_length=60, blank=True)
    cta_url = models.CharField(max_length=500, blank=True)
    image = models.ImageField(upload_to=_promotion_image_path, blank=True)
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
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    priority = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = list(PROMOTION_POPUP_ORDER)
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")), name="promotion_popup_window_valid"
            ),
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
            models.Index(
                fields=["placement", "is_active", "starts_at", "ends_at"],
                name="promotion_popup_live_idx",
            ),
        ]

    def __str__(self) -> str:
        return self.name


class PromotionPopupProduct(UUIDModel):
    """A product a popup features, in the order staff chose."""

    popup = models.ForeignKey(PromotionPopup, on_delete=models.CASCADE, related_name="featured")
    product = models.ForeignKey(
        "catalog.Product", on_delete=models.CASCADE, related_name="promotion_popup_rows"
    )
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering: ClassVar[list] = ["sort_order"]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["popup", "product"], name="promotion_popup_product_unique"
            ),
        ]
