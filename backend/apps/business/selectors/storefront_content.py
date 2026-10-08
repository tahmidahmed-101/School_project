from __future__ import annotations

from django.db.models import QuerySet

from apps.business.models import HeroSlide, PromoLine


def hero_slides_list(*, active_only: bool = False) -> QuerySet[HeroSlide]:
    slides = HeroSlide.objects.all()
    return slides.filter(is_active=True) if active_only else slides


def get_hero_slide(pk) -> HeroSlide | None:
    return HeroSlide.objects.filter(pk=pk).first()


def promo_lines_list(*, active_only: bool = False) -> QuerySet[PromoLine]:
    lines = PromoLine.objects.all()
    return lines.filter(is_active=True) if active_only else lines


def get_promo_line(pk) -> PromoLine | None:
    return PromoLine.objects.filter(pk=pk).first()
