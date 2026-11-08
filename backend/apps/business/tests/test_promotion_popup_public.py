"""The storefront's view of promotion popups: which campaigns are live now,
where clicking each goes, and the order the storefront picks from."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.factories import CategoryFactory, ProductFactory

from .promotions import CONTENT, popup, sale

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


def _popups(api_client) -> list[dict]:
    response = api_client.get(CONTENT)
    assert response.status_code == 200
    return response.data["data"]["promotion_popups"]


def test_a_live_popup_carries_where_when_and_how_it_shows(api_client):
    ends = timezone.now() + timedelta(days=2)
    row = popup(ends_at=ends)

    [item] = _popups(api_client)

    assert item["id"] == str(row.id)
    assert item["image"] == f"http://testserver{row.image.url}"
    assert item["href"] == "/shop"
    assert item["shop"] == "stock"
    assert item["starts_at"] is None
    assert item["ends_at"] is not None
    assert item["sale"] is None
    # Staff-only fields stay in the dashboard.
    assert "name" not in item
    assert "description" not in item


def test_a_switched_off_campaign_never_shows(api_client):
    popup(is_active=False)

    assert _popups(api_client) == []


def test_only_campaigns_inside_their_schedule_show(api_client):
    now = timezone.now()
    popup(name="Later", starts_at=now + timedelta(hours=1))
    popup(name="Over", ends_at=now - timedelta(minutes=1))
    running = popup(
        name="Now", starts_at=now - timedelta(hours=1), ends_at=now + timedelta(hours=1)
    )

    assert [item["id"] for item in _popups(api_client)] == [str(running.id)]


def test_highest_priority_comes_first_then_newest(api_client):
    older = popup(priority=1)
    newer = popup(priority=1)
    top = popup(priority=7)

    assert [item["id"] for item in _popups(api_client)] == [
        str(top.id),
        str(newer.id),
        str(older.id),
    ]


def test_a_popup_without_a_destination_shows_with_no_link(api_client):
    popup(destination_type="none", link_url="")

    [item] = _popups(api_client)

    assert item["href"] is None


def test_product_destination_opens_the_product_while_it_is_published(api_client):
    product = ProductFactory(is_active=True, slug="hoco-eq33")
    popup(destination_type="product", product=product, link_url="")

    assert _popups(api_client)[0]["href"] == "/product/hoco-eq33"

    product.is_active = False
    product.save()
    assert _popups(api_client) == []


def test_category_destination_opens_its_shop_listing(api_client):
    stock = CategoryFactory(slug="gadgets")
    popup(destination_type="category", category=stock, link_url="", priority=2)

    assert [item["href"] for item in _popups(api_client)] == ["/shop?category=gadgets"]


def test_campaign_destination_shows_only_while_its_sale_runs(api_client):
    running = sale(name="Running")
    ended = sale(name="Ended", starts_in_days=-5, ends_in_days=-1)
    popup(destination_type="campaign", sale=running, link_url="", priority=2)
    popup(destination_type="campaign", sale=ended, link_url="", priority=1)

    [item] = _popups(api_client)

    assert item["href"] == "/shop?collection=sale"
    assert item["sale"]["name"] == "Running"
    assert item["sale"]["percent_off"] == "20.00"
