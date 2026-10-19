from __future__ import annotations

from django.db import transaction

from apps.business.models import (
    HeroPlacement,
    HeroSlide,
    PromoLine,
    PromotionPopup,
    PromotionPopupProduct,
)
from apps.catalog.models import Category, Product, Sale
from apps.catalog.selectors.sales import get_sale_by_id, live_sale_of
from apps.catalog.services.sales import stock_products
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
    "title_en",
    "title_bn",
    "body_en",
    "body_bn",
    "cta_label_en",
    "cta_label_bn",
    "cta_url",
    "starts_at",
    "ends_at",
    "priority",
    "is_active",
)
PROMOTION_STOCK_ONLY_MESSAGE = "A promotion popup features stock products only, not pre-order ones."
PREORDER_POPUP_ONLY_MESSAGE = "A pre-order popup features pre-order products only."
PREORDER = HeroPlacement.PREORDER


def _promotion_sale(sale_id) -> Sale:
    sale = get_sale_by_id(sale_id)
    if sale is None:
        raise BusinessRuleViolationError("Sale not found.", code="sale_not_found")
    return sale


def _check_unique(product_ids: list) -> None:
    if len(set(product_ids)) != len(product_ids):
        raise BusinessRuleViolationError(
            "A product is chosen more than once.", code="promotion_products_repeated"
        )


def _in_order(rows: list[Product], product_ids: list) -> list[Product]:
    by_id = {product.id: product for product in rows}
    return [by_id[product_id] for product_id in product_ids]


def _featured_products(sale: Sale, product_ids: list) -> list[Product]:
    """A shop popup's products in the chosen order: live stock products the
    sale covers. None is allowed. Checked in a fixed number of queries,
    however many are chosen."""
    if not product_ids:
        return []
    _check_unique(product_ids)
    rows = stock_products(
        product_ids, code="promotion_product_not_stock", message=PROMOTION_STOCK_ONLY_MESSAGE
    )
    coverage = live_sale_of(sale)
    uncovered = sorted(product.name for product in rows if not coverage.covers(product))
    if uncovered:
        raise BusinessRuleViolationError(
            f"Not covered by the sale \"{sale.name}\": {', '.join(uncovered)}.",
            code="promotion_product_not_in_sale",
        )
    return _in_order(rows, product_ids)


def _preorder_products(product_ids: list) -> list[Product]:
    """A pre-order popup's products in the chosen order: live products of the
    pre-order shop. Whether each is open for ordering is decided when the
    storefront reads the popup, so a campaign can be set up ahead of time."""
    if not product_ids:
        return []
    _check_unique(product_ids)
    rows = list(
        Product.objects.select_related("category").filter(
            id__in=product_ids, deleted_at__isnull=True
        )
    )
    if len(rows) != len(product_ids):
        raise BusinessRuleViolationError(
            "One or more of the chosen items no longer exist.", code="invalid_target"
        )
    if any(product.category.category_type != Category.CategoryType.PREORDER for product in rows):
        raise BusinessRuleViolationError(
            PREORDER_POPUP_ONLY_MESSAGE, code="promotion_product_not_preorder"
        )
    return _in_order(rows, product_ids)


def _products_for(popup: PromotionPopup, product_ids: list) -> list[Product]:
    if popup.placement == PREORDER:
        return _preorder_products(product_ids)
    return _featured_products(popup.sale, product_ids)


def _check_popup(popup: PromotionPopup) -> None:
    if popup.ends_at <= popup.starts_at:
        raise BusinessRuleViolationError(
            "A popup must end after it starts.", code="promotion_window_invalid"
        )
    if (popup.cta_label_en or popup.cta_label_bn) and not popup.cta_url:
        raise BusinessRuleViolationError(
            "A button label needs a link.", code="promotion_cta_url_required"
        )


def _set_featured(popup: PromotionPopup, products: list[Product]) -> None:
    popup.featured.all().delete()
    PromotionPopupProduct.objects.bulk_create(
        PromotionPopupProduct(popup=popup, product=product, sort_order=index)
        for index, product in enumerate(products)
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
    """`placement` decides the rules: a shop (`home`) popup needs a sale and
    features stock products it covers; a `preorder` one takes no sale and
    features pre-order products."""
    popup = PromotionPopup(placement=data.get("placement") or HeroPlacement.HOME)
    _apply(popup, PROMOTION_POPUP_FIELDS, data)
    _check_popup(popup)
    if popup.placement == PREORDER:
        if data.get("sale_id"):
            raise BusinessRuleViolationError(
                "A pre-order popup has no sale; sales never apply to pre-orders.",
                code="promotion_sale_not_allowed",
            )
    else:
        if not data.get("sale_id"):
            raise BusinessRuleViolationError(
                "Choose the sale this popup promotes.", code="promotion_sale_required"
            )
        popup.sale = _promotion_sale(data["sale_id"])
    products = _products_for(popup, data.get("product_ids") or [])
    if data.get("image") is not None:
        validate_image_upload(data["image"])
        popup.image = data["image"]
    popup.save()
    _set_featured(popup, products)
    return popup


@transaction.atomic
def update_promotion_popup(*, popup: PromotionPopup, data: dict) -> PromotionPopup:
    """Partial: only the given fields change. A popup stays in the shop it was
    made for. A new sale or product list is checked against each other;
    changing one re-checks the other."""
    if data.get("placement", popup.placement) != popup.placement:
        raise BusinessRuleViolationError(
            "A popup stays in the shop it was made for. Create a new one instead.",
            code="promotion_placement_fixed",
        )
    changed = _apply(popup, PROMOTION_POPUP_FIELDS, data)
    _check_popup(popup)
    if "sale_id" in data:
        if popup.placement == PREORDER:
            raise BusinessRuleViolationError(
                "A pre-order popup has no sale; sales never apply to pre-orders.",
                code="promotion_sale_not_allowed",
            )
        popup.sale = _promotion_sale(data["sale_id"])
        changed.append("sale")
    old_image = ""
    if "image" in data:
        old_image = popup.image.name
        if data["image"] is not None:
            validate_image_upload(data["image"])
        popup.image = data["image"] or ""
        changed.append("image")
    if "sale_id" in data or "product_ids" in data:
        product_ids = (
            data["product_ids"]
            if "product_ids" in data
            else [row.product_id for row in popup.featured.all()]
        )
        _set_featured(popup, _products_for(popup, product_ids))
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
