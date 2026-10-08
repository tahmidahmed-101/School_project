from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import TimeStampedModel
from apps.common.utils.files import unique_upload_path


def _hero_image_path(instance: HeroSlide, filename: str) -> str:
    return unique_upload_path(instance, filename, subdir="hero")


class HeroPlacement(models.TextChoices):
    HOME = "home", "Home"
    PREORDER = "preorder", "Pre-order"
    BOTH = "both", "Both"


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
        max_length=20, choices=HeroPlacement.choices, default=HeroPlacement.BOTH
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
        max_length=20, choices=HeroPlacement.choices, default=HeroPlacement.BOTH
    )
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering: ClassVar[list] = ["sort_order", "created_at"]

    def __str__(self) -> str:
        return self.text_en
