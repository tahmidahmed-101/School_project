"""The storefront-content `promotion_popup`: the newest switched-on shop popup
whose sale is running, as its image, link and sale."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.catalog.services.sales import delete_sale, update_sale

from .promotions import CONTENT, png, popup, sale

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


def test_an_eligible_popup_carries_image_link_and_sale(api_client):
    offer = sale("25.00", name="Eid offer")
    row = popup(offer, link_url="/shop?collection=sale")

    data = _popup_data(api_client)

    assert data == {
        "id": str(row.id),
        "image": f"http://testserver{row.image.url}",
        "link_url": "/shop?collection=sale",
        "sale": {
            "name": "Eid offer",
            "percent_off": "25.00",
            "ends_at": data["sale"]["ends_at"],
        },
    }
    assert data["sale"]["ends_at"]


def test_a_popup_without_a_link_sends_an_empty_link(api_client):
    popup(sale())

    assert _popup_data(api_client)["link_url"] == ""


def test_a_switched_off_popup_is_hidden(api_client):
    popup(sale(), is_active=False)

    assert _popup_data(api_client) is None


def test_a_popup_is_hidden_when_its_sale_is_not_running(api_client, admin_user):
    popup(sale(starts_in_days=2))
    assert _popup_data(api_client) is None

    popup(sale(starts_in_days=-5, ends_in_days=-1))
    assert _popup_data(api_client) is None

    switched_off = sale()
    popup(switched_off)
    update_sale(sale=switched_off, is_active=False)
    assert _popup_data(api_client) is None

    deleted = sale()
    popup(deleted)
    delete_sale(sale=deleted, actor=admin_user)
    assert _popup_data(api_client) is None


def test_the_newest_popup_wins(api_client):
    offer = sale()
    popup(offer)
    newest = popup(offer)

    assert _popup_data(api_client)["id"] == str(newest.id)


def test_a_newer_popup_whose_sale_is_not_running_gives_way(api_client):
    live = popup(sale())
    popup(sale(starts_in_days=2))

    assert _popup_data(api_client)["id"] == str(live.id)


def test_hero_and_promo_shapes_are_unchanged_beside_a_popup(api_client):
    from apps.business.models import HeroSlide, PromoLine

    HeroSlide.objects.create(image=png(), title_en="Banner")
    PromoLine.objects.create(text_en="Free delivery")
    popup(sale())

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


def test_a_running_sale_that_ends_hides_the_popup(api_client):
    offer = sale(ends_in_days=1)
    popup(offer)
    assert _popup_data(api_client) is not None

    update_sale(
        sale=offer, ends_at=timezone.now() - timedelta(minutes=1), starts_at=offer.starts_at
    )
    assert _popup_data(api_client) is None
