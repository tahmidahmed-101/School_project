"""The pre-order page popup: an image and an optional link, with no sale."""

from __future__ import annotations

import pytest

from apps.business.models import PromotionPopup

from .promotions import CONTENT, POPUPS, png, popup, sale

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _error(response) -> str:
    return response.data["error"]["code"]


def _content(api_client):
    response = api_client.get(CONTENT)
    assert response.status_code == 200
    return response.data["data"]


# --- dashboard -------------------------------------------------------------------


def test_admin_creates_a_preorder_popup_without_a_sale(admin_client):
    response = admin_client.post(
        POPUPS, {"placement": "preorder", "image": png()}, format="multipart"
    )

    assert response.status_code == 201, response.data
    assert response.data["data"]["placement"] == "preorder"
    assert response.data["data"]["sale"] is None
    assert PromotionPopup.objects.get().sale is None


def test_a_preorder_popup_takes_no_sale(admin_client):
    response = admin_client.post(
        POPUPS,
        {"placement": "preorder", "image": png(), "sale_id": str(sale().id)},
        format="multipart",
    )

    assert response.status_code == 400
    assert _error(response) == "promotion_sale_not_allowed"
    assert not PromotionPopup.objects.exists()

    row = popup(None, placement="preorder")
    patched = admin_client.patch(f"{POPUPS}{row.id}/", {"sale_id": str(sale().id)}, format="json")
    assert patched.status_code == 400
    assert _error(patched) == "promotion_sale_not_allowed"


def test_a_popup_stays_in_its_shop(admin_client):
    row = popup(None, placement="preorder")

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"placement": "home"}, format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_placement_fixed"


def test_admin_list_carries_both_shops(admin_client):
    popup(sale())
    popup(None, placement="preorder")

    rows = admin_client.get(POPUPS).data["data"]

    assert sorted(row["placement"] for row in rows) == ["home", "preorder"]


# --- storefront ------------------------------------------------------------------


def test_each_page_gets_its_own_popup(api_client):
    shop = popup(sale())
    preorder = popup(None, placement="preorder", link_url="/product/winter-jacket")

    data = _content(api_client)

    assert data["promotion_popup"]["id"] == str(shop.id)
    assert data["preorder_popup"] == {
        "id": str(preorder.id),
        "image": f"http://testserver{preorder.image.url}",
        "link_url": "/product/winter-jacket",
    }


def test_a_switched_off_preorder_popup_is_hidden(api_client):
    popup(None, placement="preorder", is_active=False)

    assert _content(api_client)["preorder_popup"] is None


def test_the_newest_preorder_popup_wins(api_client):
    popup(None, placement="preorder")
    newest = popup(None, placement="preorder")

    assert _content(api_client)["preorder_popup"]["id"] == str(newest.id)
