"""The storefront-content `promotion_popup`: shown only while the campaign,
its sale and its products all still hold, and priced by the sale itself."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.catalog.factories import ProductImageFactory, ProductVariantFactory
from apps.catalog.services.sales import delete_sale, update_sale

from .promotions import CONTENT, png, popup, sale, stock_product, window

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _popup_data(api_client):
    response = api_client.get(CONTENT)
    assert response.status_code == 200
    return response.data["data"]["promotion_popup"]


def test_no_popup_keeps_the_existing_response_and_adds_null(api_client):
    data = api_client.get(CONTENT).data["data"]

    assert data == {
        "hero_slides": [],
        "promo_lines": [],
        "promotion_popup": None,
        "preorder_popup": None,
    }


def test_an_eligible_popup_carries_content_sale_and_cards(api_client):
    offer = sale("25.00", name="Eid offer")
    product = stock_product("1000.00", product__name="Panjabi", product__slug="panjabi")
    ProductImageFactory(product=product, url="/catalog/panjabi.jpg", sort_order=0)
    row = popup(
        offer,
        [product],
        title_en="Eid sale",
        title_bn="ঈদ সেল",
        body_en="Up to 25% off",
        body_bn="২৫% পর্যন্ত ছাড়",
        cta_label_en="Shop now",
        cta_label_bn="এখনই কিনুন",
        cta_url="/shop?sale=eid",
        image=png(),
    )

    data = _popup_data(api_client)

    assert data["id"] == str(row.id)
    assert data["image"] == f"http://testserver{row.image.url}"
    assert data["title"] == {"en": "Eid sale", "bn": "ঈদ সেল"}
    assert data["body"] == {"en": "Up to 25% off", "bn": "২৫% পর্যন্ত ছাড়"}
    assert data["cta"] == {"label": {"en": "Shop now", "bn": "এখনই কিনুন"}, "url": "/shop?sale=eid"}
    assert data["sale"]["name"] == "Eid offer"
    assert data["sale"]["percent_off"] == "25.00"
    assert data["sale"]["ends_at"] is not None
    assert data["products"] == [
        {
            "id": str(product.id),
            "name": "Panjabi",
            "slug": "panjabi",
            "image": "/catalog/panjabi.jpg",
            "price": "750.00",
            "original_price": "1000.00",
            "percent_off": "25.00",
        }
    ]
    assert "name" not in data  # the dashboard label stays internal


def test_a_popup_without_a_link_has_no_cta_and_no_image(api_client):
    popup(sale(), [stock_product()])

    data = _popup_data(api_client)

    assert data["cta"] is None
    assert data["image"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"is_active": False},
        window(starts_in_days=1, ends_in_days=5),
        window(starts_in_days=-5, ends_in_days=-1),
    ],
    ids=["switched-off", "scheduled", "ended"],
)
def test_popups_outside_their_own_window_or_switched_off_are_hidden(api_client, fields):
    popup(sale(), [stock_product()], **fields)

    assert _popup_data(api_client) is None


def test_a_popup_is_hidden_when_its_sale_is_not_running(api_client, admin_user):
    product = stock_product()
    scheduled = sale(starts_in_days=2)
    popup(scheduled, [product])
    assert _popup_data(api_client) is None

    ended = sale(starts_in_days=-5, ends_in_days=-1)
    popup(ended, [product])
    assert _popup_data(api_client) is None

    switched_off = sale()
    popup(switched_off, [product])
    update_sale(sale=switched_off, is_active=False)
    assert _popup_data(api_client) is None

    deleted = sale()
    popup(deleted, [product])
    delete_sale(sale=deleted, actor=admin_user)
    assert _popup_data(api_client) is None


def test_a_popup_without_products_shows_with_no_cards(api_client):
    row = popup(sale(), [])

    data = _popup_data(api_client)

    assert data["id"] == str(row.id)
    assert data["products"] == []
    assert data["sale"]["percent_off"] == "20.00"


def test_a_popup_without_products_still_needs_its_sale_running(api_client):
    popup(sale(starts_in_days=2), [])

    assert _popup_data(api_client) is None


def test_stale_products_are_dropped_and_none_left_hides_the_popup(api_client):
    offer = sale()
    keep = stock_product()
    hidden = stock_product()
    popup(offer, [hidden, keep])
    hidden.is_active = False
    hidden.save(update_fields=["is_active"])

    assert [card["id"] for card in _popup_data(api_client)["products"]] == [str(keep.id)]

    keep.is_active = False
    keep.save(update_fields=["is_active"])
    assert _popup_data(api_client) is None


def test_a_product_another_sale_prices_is_not_shown_as_this_ones(api_client):
    """A bigger sale covering the same product sets its price, so this
    campaign's sale is not responsible for it and the card is left out."""
    product = stock_product()
    small = sale("10.00", name="Small")
    sale("30.00", name="Big")
    popup(small, [product])

    assert _popup_data(api_client) is None


def test_a_product_whose_discount_price_beats_the_sale_is_not_shown(api_client):
    product = stock_product("1000.00", discount_price=Decimal("700.00"))
    popup(sale("20.00"), [product])

    assert _popup_data(api_client) is None


def test_a_product_the_sale_stopped_covering_is_dropped(api_client):
    keep, leave = stock_product(), stock_product()
    offer = sale(applies_to="products", product_ids=[keep.id, leave.id])
    popup(offer, [keep, leave])
    update_sale(sale=offer, product_ids=[keep.id])

    assert [card["id"] for card in _popup_data(api_client)["products"]] == [str(keep.id)]


def test_the_card_shows_the_cheapest_variant_the_sale_prices(api_client):
    product = stock_product("1000.00", sku="B-SKU")
    ProductVariantFactory(product=product, price=Decimal("600.00"), sku="A-SKU")
    popup(sale("50.00"), [product])

    (card,) = _popup_data(api_client)["products"]

    assert (card["price"], card["original_price"]) == ("300.00", "600.00")


def test_highest_priority_wins_then_latest_start_then_newest(api_client):
    offer = sale()
    product = stock_product()
    popup(offer, [product], name="Low", priority=1)
    high_old = popup(offer, [product], name="High older start", priority=5, **window(-3, 5))
    high_new = popup(offer, [product], name="High newer start", priority=5, **window(-1, 5))

    assert _popup_data(api_client)["id"] == str(high_new.id)

    high_new.starts_at = high_old.starts_at
    high_new.save(update_fields=["starts_at"])
    newest = high_new if high_new.created_at > high_old.created_at else high_old
    assert _popup_data(api_client)["id"] == str(newest.id)


def test_an_ineligible_higher_priority_popup_gives_way(api_client):
    product = stock_product()
    popup(sale(starts_in_days=2), [product], name="Waiting sale", priority=9)
    fallback = popup(sale(name="Live"), [product], name="Live", priority=1)

    assert _popup_data(api_client)["id"] == str(fallback.id)


def test_query_count_does_not_grow_with_featured_products(api_client):
    def _campaign(count: int):
        products = [stock_product() for _ in range(count)]
        for product in products:
            ProductImageFactory(product=product)
        return popup(sale(), products, priority=count)

    _campaign(1)
    api_client.get(CONTENT)  # warm per-process caches (live sales)
    with CaptureQueriesContext(connection) as one:
        assert len(_popup_data(api_client)["products"]) == 1

    _campaign(8)
    api_client.get(CONTENT)
    with CaptureQueriesContext(connection) as eight:
        assert len(_popup_data(api_client)["products"]) == 8

    assert len(eight) == len(one)


def test_hero_and_promo_shapes_are_unchanged_beside_a_popup(api_client):
    from apps.business.models import HeroSlide, PromoLine

    HeroSlide.objects.create(image=png(), title_en="Banner")
    PromoLine.objects.create(text_en="Free delivery")
    popup(sale(), [stock_product()])

    data = api_client.get(CONTENT).data["data"]

    assert set(data) == {"hero_slides", "promo_lines", "promotion_popup", "preorder_popup"}
    assert set(data["hero_slides"][0]) == {
        "id",
        "image",
        "alt",
        "tag",
        "title",
        "link_url",
        "placement",
    }
    assert set(data["promo_lines"][0]) == {"id", "text", "placement"}


def test_a_running_sale_that_ends_mid_window_hides_the_popup(api_client):
    offer = sale(ends_in_days=1)
    popup(offer, [stock_product()])
    assert _popup_data(api_client) is not None

    update_sale(
        sale=offer, ends_at=timezone.now() - timedelta(minutes=1), starts_at=offer.starts_at
    )
    assert _popup_data(api_client) is None
