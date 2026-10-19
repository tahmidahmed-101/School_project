from __future__ import annotations

from dataclasses import dataclass

from django.db.models import QuerySet

from apps.business.models import (
    HeroPlacement,
    HeroSlide,
    PromoLine,
    PromotionPopup,
)
from apps.business.models.storefront_content import PROMOTION_POPUP_ORDER
from apps.catalog.selectors.sales import LiveSale, running_sale_by_id


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


def promotion_popups_list() -> QuerySet[PromotionPopup]:
    """Every popup, switched-off ones included, in the order the storefront
    would prefer them."""
    return PromotionPopup.objects.select_related("sale").order_by(*PROMOTION_POPUP_ORDER)


def get_promotion_popup(pk) -> PromotionPopup | None:
    return PromotionPopup.objects.select_related("sale").filter(pk=pk).first()


@dataclass(frozen=True)
class StorefrontPromotion:
    """`sale` is the running sale of a shop popup; None for a pre-order one."""

    popup: PromotionPopup
    sale: LiveSale | None


def _live_candidates(placement: str) -> QuerySet[PromotionPopup]:
    return (
        PromotionPopup.objects.filter(placement=placement, is_active=True)
        .exclude(image="")
        .select_related("sale")
        .order_by(*PROMOTION_POPUP_ORDER)
    )


def eligible_promotion_popup() -> StorefrontPromotion | None:
    """The shop (home page) popup to show now, or None: the newest switched-on
    one whose sale is switched on, not deleted and running."""
    candidates = _live_candidates(HeroPlacement.HOME).filter(
        sale__is_active=True, sale__deleted_at__isnull=True
    )
    for popup in candidates:
        sale = running_sale_by_id(popup.sale_id)
        if sale is not None:
            return StorefrontPromotion(popup=popup, sale=sale)
    return None


def eligible_preorder_popup() -> StorefrontPromotion | None:
    """The pre-order page popup to show now, or None: the newest switched-on one."""
    popup = _live_candidates(HeroPlacement.PREORDER).first()
    return StorefrontPromotion(popup=popup, sale=None) if popup is not None else None
