from __future__ import annotations

from django.db import transaction

from apps.business.models import (
    HeroSlide,
    PromoLine,
    PromotionPopup,
)
from apps.catalog.models import Category, Product, Sale
from apps.catalog.selectors.categories import get_category_by_id
from apps.catalog.selectors.products import get_product_by_id
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


PROMOTION_POPUP_FIELDS = (
    "name",
    "is_active",
    "priority",
    "starts_at",
    "ends_at",
    "destination_type",
    "link_url",
)
Destination = PromotionPopup.Destination


class PromotionPopupFieldError(BusinessRuleViolationError):
    """A rule broken by one field of the popup, so the form can mark it."""

    def __init__(self, field: str, message: str, *, code: str) -> None:
        super().__init__(message, code=code)
        self.field = field


def _promotion_sale(sale_id) -> Sale:
    sale = get_sale_by_id(sale_id)
    if sale is None:
        raise PromotionPopupFieldError("sale_id", "Sale not found.", code="sale_not_found")
    return sale


def _destination_product(product_id) -> Product:
    product = get_product_by_id(product_id)
    if product is None:
        raise PromotionPopupFieldError("product_id", "Product not found.", code="product_not_found")
    return product


def _destination_category(category_id) -> Category:
    category = get_category_by_id(category_id)
    if category is None:
        raise PromotionPopupFieldError(
            "category_id", "Category not found.", code="category_not_found"
        )
    return category


def _apply_destination_refs(popup: PromotionPopup, data: dict) -> list[str]:
    """Set the product / category / sale the data names; a null clears it."""
    changed = []
    for key, field, load in (
        ("product_id", "product", _destination_product),
        ("category_id", "category", _destination_category),
        ("sale_id", "sale", _promotion_sale),
    ):
        if key in data:
            setattr(popup, field, load(data[key]) if data[key] else None)
            changed.append(field)
    return changed


def _check_popup(popup: PromotionPopup) -> None:
    """The rules a saved popup always meets, checked on the merged result so a
    partial update is held to them too. Only the destination that matches
    `destination_type` is kept; the others are cleared."""
    if not popup.name.strip():
        raise PromotionPopupFieldError("name", "Name the campaign.", code="promotion_name_required")
    if popup.starts_at and popup.ends_at and popup.ends_at <= popup.starts_at:
        raise PromotionPopupFieldError(
            "ends_at", "The end must be after the start.", code="promotion_schedule_invalid"
        )
    kind = popup.destination_type
    # `none` needs nothing: the image alone is the popup.
    requirements: dict[str, tuple[str, object, str]] = {
        Destination.PRODUCT: ("product_id", popup.product_id, "Choose the product."),
        Destination.CATEGORY: ("category_id", popup.category_id, "Choose the category."),
        Destination.CAMPAIGN: ("sale_id", popup.sale_id, "Choose the campaign."),
        Destination.URL: ("link_url", popup.link_url, "Enter the link."),
    }
    missing = requirements.get(kind)
    if missing is not None and not missing[1]:
        raise PromotionPopupFieldError(
            missing[0], missing[2], code="promotion_destination_required"
        )
    _check_destination_shop(popup)
    if kind != Destination.PRODUCT:
        popup.product = None
    if kind != Destination.CATEGORY:
        popup.category = None
    if kind != Destination.CAMPAIGN:
        popup.sale = None
    if kind != Destination.URL:
        popup.link_url = ""


def _check_destination_shop(popup: PromotionPopup) -> None:
    """A popup leads into its own shop: a product or category of that shop."""
    kind = popup.destination_type
    product, category = popup.product, popup.category
    if kind == Destination.PRODUCT and product and product.category.category_type != popup.shop:
        raise PromotionPopupFieldError(
            "product_id",
            "Choose a product from this shop.",
            code="promotion_destination_other_shop",
        )
    if kind == Destination.CATEGORY and category and category.category_type != popup.shop:
        raise PromotionPopupFieldError(
            "category_id",
            "Choose a category from this shop.",
            code="promotion_destination_other_shop",
        )


def _forget_file_on_commit(name: str) -> None:
    """Remove a replaced or deleted image once the change is committed, so a
    rolled-back save never loses the picture still in use."""
    if not name:
        return
    storage = PromotionPopup._meta.get_field("image").storage
    transaction.on_commit(lambda: storage.delete(name))


@transaction.atomic
def create_promotion_popup(*, data: dict) -> PromotionPopup:
    """The image is required; see `_check_popup` for the other rules."""
    popup = PromotionPopup(shop=data.get("shop") or PromotionPopup.Shop.STOCK)
    _apply(popup, PROMOTION_POPUP_FIELDS, data)
    _apply_destination_refs(popup, data)
    _check_popup(popup)
    if data.get("image") is None:
        raise PromotionPopupFieldError(
            "image", "Upload the popup image.", code="promotion_image_required"
        )
    validate_image_upload(data["image"])
    popup.image = data["image"]
    popup.save()
    return popup


@transaction.atomic
def update_promotion_popup(*, popup: PromotionPopup, data: dict) -> PromotionPopup:
    """Partial: only the given fields change. A popup stays in the shop it was
    made for, and keeps an image: a new one replaces the old."""
    if data.get("shop", popup.shop) != popup.shop:
        raise PromotionPopupFieldError(
            "shop",
            "A popup stays in the shop it was made for. Create a new one instead.",
            code="promotion_shop_fixed",
        )
    _apply(popup, PROMOTION_POPUP_FIELDS, data)
    _apply_destination_refs(popup, data)
    _check_popup(popup)
    old_image = ""
    if "image" in data:
        if data["image"] is None:
            raise PromotionPopupFieldError(
                "image",
                "A popup needs an image; upload a new one to replace it.",
                code="promotion_image_required",
            )
        validate_image_upload(data["image"])
        old_image = popup.image.name
        popup.image = data["image"]
    popup.save()
    if old_image and old_image != popup.image.name:
        _forget_file_on_commit(old_image)
    return popup


@transaction.atomic
def delete_promotion_popup(*, popup: PromotionPopup) -> None:
    image = popup.image.name
    popup.delete()
    _forget_file_on_commit(image)
