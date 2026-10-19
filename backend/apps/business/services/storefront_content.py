from __future__ import annotations

from django.db import transaction

from apps.business.models import (
    HeroPlacement,
    HeroSlide,
    PromoLine,
    PromotionPopup,
)
from apps.catalog.models import Sale
from apps.catalog.selectors.sales import get_sale_by_id
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.files import validate_image_upload, validate_upload_size

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


PROMOTION_POPUP_FIELDS = ("link_url", "is_active")
PREORDER = HeroPlacement.PREORDER
SALE_NOT_ALLOWED_MESSAGE = "A pre-order popup has no sale; sales never apply to pre-orders."


def _promotion_sale(sale_id) -> Sale:
    sale = get_sale_by_id(sale_id)
    if sale is None:
        raise BusinessRuleViolationError("Sale not found.", code="sale_not_found")
    return sale


def _forget_file_on_commit(name: str) -> None:
    """Remove a replaced or deleted image once the change is committed, so a
    rolled-back save never loses the picture still in use."""
    if not name:
        return
    storage = PromotionPopup._meta.get_field("image").storage
    transaction.on_commit(lambda: storage.delete(name))


@transaction.atomic
def create_promotion_popup(*, data: dict) -> PromotionPopup:
    """`placement` decides the rules: a shop (`home`) popup needs a sale; a
    `preorder` one takes none. The image is required."""
    popup = PromotionPopup(placement=data.get("placement") or HeroPlacement.HOME)
    _apply(popup, PROMOTION_POPUP_FIELDS, data)
    if popup.placement == PREORDER:
        if data.get("sale_id"):
            raise BusinessRuleViolationError(
                SALE_NOT_ALLOWED_MESSAGE, code="promotion_sale_not_allowed"
            )
    else:
        if not data.get("sale_id"):
            raise BusinessRuleViolationError(
                "Choose the sale this popup promotes.", code="promotion_sale_required"
            )
        popup.sale = _promotion_sale(data["sale_id"])
    if data.get("image") is None:
        raise BusinessRuleViolationError("Upload the popup image.", code="promotion_image_required")
    validate_image_upload(data["image"])
    popup.image = data["image"]
    popup.save()
    return popup


@transaction.atomic
def update_promotion_popup(*, popup: PromotionPopup, data: dict) -> PromotionPopup:
    """Partial: only the given fields change. A popup stays in the shop it was
    made for, and keeps an image: a new one replaces the old."""
    if data.get("placement", popup.placement) != popup.placement:
        raise BusinessRuleViolationError(
            "A popup stays in the shop it was made for. Create a new one instead.",
            code="promotion_placement_fixed",
        )
    changed = _apply(popup, PROMOTION_POPUP_FIELDS, data)
    if "sale_id" in data:
        if popup.placement == PREORDER:
            raise BusinessRuleViolationError(
                SALE_NOT_ALLOWED_MESSAGE, code="promotion_sale_not_allowed"
            )
        popup.sale = _promotion_sale(data["sale_id"])
        changed.append("sale")
    old_image = ""
    if "image" in data:
        if data["image"] is None:
            raise BusinessRuleViolationError(
                "A popup needs an image; upload a new one to replace it.",
                code="promotion_image_required",
            )
        validate_image_upload(data["image"])
        old_image = popup.image.name
        popup.image = data["image"]
        changed.append("image")
    if changed:
        popup.save(update_fields=[*changed, "updated_at"])
    if old_image and old_image != popup.image.name:
        _forget_file_on_commit(old_image)
    return popup


@transaction.atomic
def delete_promotion_popup(*, popup: PromotionPopup) -> None:
    image = popup.image.name
    popup.delete()
    _forget_file_on_commit(image)
