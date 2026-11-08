from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlencode

from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.business.models import (
    HeroPlacement,
    HeroSlide,
    PromoLine,
    PromotionPopup,
)
from apps.business.models.storefront_content import PROMOTION_POPUP_ORDER
from apps.catalog.selectors.sales import LiveSale, running_sale_by_id

# The storefront page that lists the products on sale.
CAMPAIGN_PAGE = "/shop?collection=sale"


def hero_slides_list(*, active_only: bool = False) -> QuerySet[HeroSlide]:
    """With `active_only` (the storefront): active slides of a placement the
    storefront shows."""
    slides = HeroSlide.objects.all()
    if active_only:
        return slides.filter(is_active=True, placement__in=HeroPlacement.values)
    return slides


def get_hero_slide(pk) -> HeroSlide | None:
    return HeroSlide.objects.filter(pk=pk).first()


def promo_lines_list(*, active_only: bool = False) -> QuerySet[PromoLine]:
    """With `active_only` (the storefront): active lines of a placement the
    storefront shows."""
    lines = PromoLine.objects.all()
    if active_only:
        return lines.filter(is_active=True, placement__in=HeroPlacement.values)
    return lines


def get_promo_line(pk) -> PromoLine | None:
    return PromoLine.objects.filter(pk=pk).first()


def promotion_popups_list(*, shop: str | None = None) -> QuerySet[PromotionPopup]:
    """Every popup, drafts, paused and expired ones included, in the order the
    storefront would prefer them; with `shop`, only that shop's."""
    popups = PromotionPopup.objects.select_related("product", "category", "sale").prefetch_related(
        "product__images"
    )
    if shop:
        popups = popups.filter(shop=shop)
    return popups.order_by(*PROMOTION_POPUP_ORDER)


def get_promotion_popup(pk) -> PromotionPopup | None:
    return (
        PromotionPopup.objects.select_related("product", "category", "sale")
        .prefetch_related("product__images")
        .filter(pk=pk)
        .first()
    )


@dataclass(frozen=True)
class StorefrontPromotion:
    """A popup the storefront may show now, with where clicking it goes (None
    without a destination) and, for a campaign destination, the running sale."""

    popup: PromotionPopup
    href: str | None
    sale: LiveSale | None


def _popup_target(popup: PromotionPopup) -> tuple[str | None, LiveSale | None] | None:
    """Where the popup leads (a None link for a popup without a destination),
    or None when its destination is gone: a deleted or unpublished product or
    category, or a campaign not running."""
    kind = popup.destination_type
    if kind == PromotionPopup.Destination.NONE:
        return None, None
    if kind == PromotionPopup.Destination.PRODUCT:
        product = popup.product
        if product is None or product.deleted_at or not product.is_active:
            return None
        return f"/product/{product.slug}", None
    if kind == PromotionPopup.Destination.CATEGORY:
        category = popup.category
        if category is None or category.deleted_at or not category.is_active:
            return None
        return f"/shop?{urlencode({'category': category.slug})}", None
    if kind == PromotionPopup.Destination.CAMPAIGN:
        sale = running_sale_by_id(popup.sale_id) if popup.sale_id else None
        return (CAMPAIGN_PAGE, sale) if sale is not None else None
    return (popup.link_url, None) if popup.link_url else None


def live_promotion_popups(now=None) -> list[StorefrontPromotion]:
    """The popups the storefront may show now, highest priority first: active,
    inside their schedule, of the stock shop, with an image and a destination
    that still exists."""
    now = now or timezone.now()
    candidates = (
        PromotionPopup.objects.filter(is_active=True, shop=PromotionPopup.Shop.STOCK)
        .filter(Q(starts_at__isnull=True) | Q(starts_at__lte=now))
        .filter(Q(ends_at__isnull=True) | Q(ends_at__gt=now))
        .exclude(image="")
        .select_related("product", "category", "sale")
        .order_by(*PROMOTION_POPUP_ORDER)
    )
    live = []
    for popup in candidates:
        target = _popup_target(popup)
        if target is not None:
            live.append(StorefrontPromotion(popup=popup, href=target[0], sale=target[1]))
    return live
