from __future__ import annotations

from apps.business.models import HeroSlide, PromoLine
from apps.common.utils.files import validate_upload_size

HERO_SLIDE_FIELDS = (
    "image",
    "alt_text",
    "tag_en",
    "tag_bn",
    "title_en",
    "title_bn",
    "link_url",
    "placement",
    "sort_order",
    "is_active",
)
PROMO_LINE_FIELDS = ("text_en", "text_bn", "placement", "sort_order", "is_active")


def _apply(instance, fields: tuple[str, ...], data: dict) -> list[str]:
    changed = [field for field in fields if field in data]
    for field in changed:
        setattr(instance, field, data[field])
    return changed


def create_hero_slide(*, data: dict) -> HeroSlide:
    validate_upload_size(data["image"])
    slide = HeroSlide()
    _apply(slide, HERO_SLIDE_FIELDS, data)
    slide.save()
    return slide


def update_hero_slide(*, slide: HeroSlide, data: dict) -> HeroSlide:
    if "image" in data:
        validate_upload_size(data["image"])
    changed = _apply(slide, HERO_SLIDE_FIELDS, data)
    if changed:
        slide.save(update_fields=[*changed, "updated_at"])
    return slide


def delete_hero_slide(*, slide: HeroSlide) -> None:
    slide.delete()


def create_promo_line(*, data: dict) -> PromoLine:
    line = PromoLine()
    _apply(line, PROMO_LINE_FIELDS, data)
    line.save()
    return line


def update_promo_line(*, line: PromoLine, data: dict) -> PromoLine:
    changed = _apply(line, PROMO_LINE_FIELDS, data)
    if changed:
        line.save(update_fields=[*changed, "updated_at"])
    return line


def delete_promo_line(*, line: PromoLine) -> None:
    line.delete()
