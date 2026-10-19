from __future__ import annotations

from dataclasses import dataclass

from django.db.models import Prefetch, QuerySet
from django.utils import timezone

from apps.business.models import (
    HeroPlacement,
    HeroSlide,
    PromoLine,
    PromotionPopup,
    PromotionPopupProduct,
)
from apps.business.models.storefront_content import PROMOTION_POPUP_ORDER
from apps.catalog.models import Category, Product, ProductVariant
from apps.catalog.selectors.products import storefront_products_by_ids
from apps.catalog.selectors.sales import LiveSale, prime_running_sales, running_sale_by_id
from apps.orders.services.carts import get_preordered_quantities


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


def _with_relations(popups: QuerySet[PromotionPopup]) -> QuerySet[PromotionPopup]:
    return popups.select_related("sale").prefetch_related(
        Prefetch("featured", queryset=PromotionPopupProduct.objects.select_related("product"))
    )


def promotion_popups_list() -> QuerySet[PromotionPopup]:
    """Every popup, switched-off and scheduled ones included, in the order the
    storefront would prefer them."""
    return _with_relations(PromotionPopup.objects.order_by(*PROMOTION_POPUP_ORDER))


def get_promotion_popup(pk) -> PromotionPopup | None:
    return _with_relations(PromotionPopup.objects.filter(pk=pk)).first()


@dataclass(frozen=True)
class PromotionCard:
    """A featured product and the variant whose price the card shows."""

    product: Product
    variant: ProductVariant


@dataclass(frozen=True)
class StorefrontPromotion:
    """`sale` is the running sale of a shop popup; None for a pre-order one."""

    popup: PromotionPopup
    sale: LiveSale | None
    cards: list[PromotionCard]


def _sale_priced_variant(product: Product, sale: LiveSale) -> ProductVariant | None:
    """The product's cheapest live variant whose price `sale` sets right now,
    or None. `applied_sale` is the same rule the product page prices by, so a
    card is never shown as discounted by a sale that is not doing it."""
    priced = [
        variant
        for variant in getattr(product, "active_variants", [])
        if variant.is_active and getattr(variant.applied_sale, "id", None) == sale.id
    ]
    return min(priced, key=lambda variant: (variant.effective_price, variant.sku), default=None)


def _orderable_preorder_variant(product: Product, preordered: dict) -> ProductVariant | None:
    """The product's cheapest live variant open for pre-order now with
    capacity left, or None. `preordered` is the batch of taken quantities, so
    no variant costs a query."""
    open_now = [
        variant
        for variant in getattr(product, "active_variants", [])
        if variant.is_active
        and variant.is_preorder_active
        and (
            variant.preorder_stock_limit is None
            or preordered.get(variant.id, 0) < variant.preorder_stock_limit
        )
    ]
    return min(open_now, key=lambda variant: (variant.effective_price, variant.sku), default=None)


def _live_candidates(placement: str) -> list[PromotionPopup]:
    now = timezone.now()
    candidates = PromotionPopup.objects.filter(
        placement=placement, is_active=True, starts_at__lte=now, ends_at__gt=now
    )
    if placement == HeroPlacement.HOME:
        candidates = candidates.filter(sale__is_active=True, sale__deleted_at__isnull=True)
    return list(
        candidates.select_related("sale")
        .prefetch_related("featured")
        .order_by(*PROMOTION_POPUP_ORDER)
    )


def _featured_products_of(popups, *, kind: str) -> dict:
    """Every product these popups feature that the storefront still shows and
    that belongs to the `kind` shop, by id, loaded in a fixed number of queries."""
    wanted = {row.product_id for popup in popups for row in popup.featured.all()}
    return {
        product.id: product
        for product in storefront_products_by_ids(wanted)
        if product.category.category_type == kind
    }


def _first_showable(candidates, card_for) -> StorefrontPromotion | None:
    """The first candidate that features no products or still has a card;
    one whose every featured product is gone is skipped."""
    for popup, sale in candidates:
        cards = [
            card
            for row in popup.featured.all()
            if (card := card_for(row.product_id, sale)) is not None
        ]
        if cards or not popup.featured.all():
            return StorefrontPromotion(popup=popup, sale=sale, cards=cards)
    return None


def eligible_promotion_popup() -> StorefrontPromotion | None:
    """The shop (home page) popup to show now, or None.

    A candidate is switched on and inside its own window, and its sale is
    switched on, not deleted and running. Of those, in PROMOTION_POPUP_ORDER,
    the first wins that either features no products or still has at least one
    featured product the sale prices; featured products that left the sale,
    the storefront or the stock shop are left off its cards, and a popup whose
    every featured product is gone is skipped. Queries are fixed in number
    however many products or candidates there are."""
    candidates = []
    for popup in _live_candidates(HeroPlacement.HOME):
        sale = running_sale_by_id(popup.sale_id)
        if sale is not None:
            candidates.append((popup, sale))
    if not candidates:
        return None
    products = _featured_products_of(
        [popup for popup, _sale in candidates], kind=Category.CategoryType.STOCK
    )
    prime_running_sales(
        variant for product in products.values() for variant in product.active_variants
    )

    def card_for(product_id, sale) -> PromotionCard | None:
        product = products.get(product_id)
        variant = _sale_priced_variant(product, sale) if product is not None else None
        return PromotionCard(product=product, variant=variant) if variant is not None else None

    return _first_showable(candidates, card_for)


def eligible_preorder_popup() -> StorefrontPromotion | None:
    """The pre-order page popup to show now, or None.

    A candidate is switched on and inside its own window. Of those, in
    PROMOTION_POPUP_ORDER, the first wins that either features no products or
    still has at least one featured product open for pre-order with capacity
    left; the rest of its products are left off its cards. Queries are fixed
    in number however many products or candidates there are."""
    candidates = [(popup, None) for popup in _live_candidates(HeroPlacement.PREORDER)]
    if not candidates:
        return None
    products = _featured_products_of(
        [popup for popup, _sale in candidates], kind=Category.CategoryType.PREORDER
    )
    preordered = get_preordered_quantities(
        [variant for product in products.values() for variant in product.active_variants]
    )

    def card_for(product_id, _sale) -> PromotionCard | None:
        product = products.get(product_id)
        variant = (
            _orderable_preorder_variant(product, preordered) if product is not None else None
        )
        return PromotionCard(product=product, variant=variant) if variant is not None else None

    return _first_showable(candidates, card_for)
