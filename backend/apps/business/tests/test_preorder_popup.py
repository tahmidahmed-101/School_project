"""The pre-order page popup: its own campaigns, no sale, and cards only for
pre-order products open for ordering with capacity left."""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from apps.business.models import PromotionPopup
from apps.catalog.factories import ProductImageFactory
from apps.orders.factories import SalesOrderLineFactory

from .promotions import (
    CONTENT,
    POPUPS,
    open_preorder_product,
    popup,
    preorder_product,
    sale,
    stock_product,
    window,
)

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _payload(products, **overrides) -> dict:
    dates = window()
    return {
        "placement": "preorder",
        "name": "Winter pre-order",
        "title_en": "Pre-order winter jackets",
        "title_bn": "শীতের জ্যাকেট প্রি-অর্ডার",
        "product_ids": [str(product.id) for product in products],
        "starts_at": dates["starts_at"].isoformat(),
        "ends_at": dates["ends_at"].isoformat(),
        **overrides,
    }


def _error(response) -> str:
    return response.data["error"]["code"]


def _preorder_data(api_client):
    response = api_client.get(CONTENT)
    assert response.status_code == 200
    return response.data["data"]


# --- dashboard -------------------------------------------------------------------


def test_admin_creates_a_preorder_popup_without_a_sale(admin_client):
    product = preorder_product()

    response = admin_client.post(POPUPS, _payload([product]), format="json")

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["placement"] == "preorder"
    assert data["sale"] is None
    assert [item["id"] for item in data["products"]] == [str(product.id)]
    assert admin_client.post(POPUPS, _payload([]), format="json").status_code == 201


def test_a_preorder_popup_takes_no_sale(admin_client):
    response = admin_client.post(POPUPS, _payload([], sale_id=str(sale().id)), format="json")
    assert response.status_code == 400
    assert _error(response) == "promotion_sale_not_allowed"

    row = popup(None, [], placement="preorder")
    patched = admin_client.patch(f"{POPUPS}{row.id}/", {"sale_id": str(sale().id)}, format="json")
    assert _error(patched) == "promotion_sale_not_allowed"


def test_a_preorder_popup_features_preorder_products_only(admin_client):
    response = admin_client.post(POPUPS, _payload([stock_product()]), format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_product_not_preorder"
    assert not PromotionPopup.objects.exists()


def test_a_shop_popup_still_refuses_preorder_products(admin_client):
    payload = _payload([preorder_product()], placement="home", sale_id=str(sale().id))

    response = admin_client.post(POPUPS, payload, format="json")

    assert _error(response) == "promotion_product_not_stock"


def test_a_popup_stays_in_its_shop(admin_client):
    row = popup(None, [], placement="preorder")

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"placement": "home"}, format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_placement_fixed"


def test_admin_list_carries_both_shops(admin_client):
    popup(sale(), [], name="Shop")
    popup(None, [], name="Pre-order", placement="preorder")

    rows = admin_client.get(POPUPS).data["data"]

    assert {(row["name"], row["placement"]) for row in rows} == {
        ("Shop", "home"),
        ("Pre-order", "preorder"),
    }


# --- storefront ------------------------------------------------------------------


def test_each_page_gets_its_own_popup(api_client):
    shop = popup(sale(), [], name="Shop")
    preorder = popup(None, [], name="Pre-order", placement="preorder")

    data = _preorder_data(api_client)

    assert data["promotion_popup"]["id"] == str(shop.id)
    assert data["preorder_popup"]["id"] == str(preorder.id)
    assert "sale" not in data["preorder_popup"]


def test_a_preorder_card_shows_preorder_price_and_delivery(api_client):
    release = timezone.now() + timedelta(days=30)
    product = open_preorder_product(
        "1000.00",
        preorder_price=Decimal("850.00"),
        release_date=release,
        product__name="Puffer jacket",
        product__slug="puffer-jacket",
    )
    ProductImageFactory(product=product, url="/catalog/puffer.jpg")
    popup(
        None,
        [product],
        placement="preorder",
        title_en="Winter pre-order",
        title_bn="শীতের প্রি-অর্ডার",
    )

    data = _preorder_data(api_client)["preorder_popup"]

    assert data["title"] == {"en": "Winter pre-order", "bn": "শীতের প্রি-অর্ডার"}
    (card,) = data["products"]
    assert card["id"] == str(product.id)
    assert (card["name"], card["slug"], card["image"]) == (
        "Puffer jacket",
        "puffer-jacket",
        "/catalog/puffer.jpg",
    )
    assert (card["price"], card["original_price"]) == ("850.00", "1000.00")
    assert card["release_date"] is not None


def test_without_a_preorder_price_there_is_no_original_price(api_client):
    popup(None, [open_preorder_product("1000.00")], placement="preorder")

    (card,) = _preorder_data(api_client)["preorder_popup"]["products"]

    assert (card["price"], card["original_price"]) == ("1000.00", None)


def test_products_not_open_or_full_are_left_off_and_none_left_hides_it(api_client):
    open_one = open_preorder_product()
    not_open = preorder_product()  # never switched on
    full = open_preorder_product(preorder_stock_limit=2)
    SalesOrderLineFactory(
        variant=full.variants.get(), quantity=2, is_preorder=True, order__status="confirmed"
    )
    popup(None, [not_open, full, open_one], placement="preorder")

    cards = _preorder_data(api_client)["preorder_popup"]["products"]
    assert [card["id"] for card in cards] == [str(open_one.id)]

    PromotionPopup.objects.all().delete()
    popup(None, [not_open, full], placement="preorder")
    assert _preorder_data(api_client)["preorder_popup"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"is_active": False},
        window(starts_in_days=1, ends_in_days=5),
        window(starts_in_days=-5, ends_in_days=-1),
    ],
    ids=["switched-off", "scheduled", "ended"],
)
def test_preorder_popups_outside_their_window_or_off_are_hidden(api_client, fields):
    popup(None, [], placement="preorder", **fields)

    assert _preorder_data(api_client)["preorder_popup"] is None


def test_highest_priority_preorder_popup_wins(api_client):
    popup(None, [], name="Low", placement="preorder", priority=1)
    high = popup(None, [], name="High", placement="preorder", priority=7)

    assert _preorder_data(api_client)["preorder_popup"]["id"] == str(high.id)


def test_query_count_does_not_grow_with_featured_preorder_products(api_client):
    def _campaign(count: int):
        products = [open_preorder_product(preorder_stock_limit=50) for _ in range(count)]
        for product in products:
            ProductImageFactory(product=product)
        return popup(None, products, placement="preorder", priority=count)

    _campaign(1)
    api_client.get(CONTENT)
    with CaptureQueriesContext(connection) as one:
        assert len(_preorder_data(api_client)["preorder_popup"]["products"]) == 1

    _campaign(8)
    api_client.get(CONTENT)
    with CaptureQueriesContext(connection) as eight:
        assert len(_preorder_data(api_client)["preorder_popup"]["products"]) == 8

    assert len(eight) == len(one)
