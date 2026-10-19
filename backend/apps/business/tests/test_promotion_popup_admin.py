"""Dashboard API for promotion popups: settings permissions, CRUD and the
rules a popup must meet before it is saved. A popup is an image, an optional
link and, in the shop, the sale it promotes."""

from __future__ import annotations

from pathlib import Path

import pytest

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.business.models import PromotionPopup
from apps.catalog.services.sales import delete_sale

from .promotions import POPUPS, png, popup, sale

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _payload(sale_row, **overrides) -> dict:
    return {"sale_id": str(sale_row.id), "image": png(), **overrides}


def _error(response) -> str:
    return response.data["error"]["code"]


def test_admin_creates_reads_lists_updates_and_deletes_a_popup(admin_client):
    offer = sale()

    created = admin_client.post(
        POPUPS, _payload(offer, link_url="/shop?collection=sale"), format="multipart"
    )
    assert created.status_code == 201, created.data
    data = created.data["data"]
    row = PromotionPopup.objects.get()
    assert set(data) == {"id", "image", "link_url", "is_active", "placement", "sale", "created_at"}
    assert data["link_url"] == "/shop?collection=sale"
    assert data["placement"] == "home"
    assert data["is_active"] is True
    assert data["image"] == f"http://testserver{row.image.url}"
    assert row.image.name.startswith("promotions/")
    assert data["sale"] == {
        "id": str(offer.id),
        "name": "Eid offer",
        "percent_off": "20.00",
        "status": "running",
    }

    detail = admin_client.get(f"{POPUPS}{row.id}/")
    assert detail.status_code == 200
    assert detail.data["data"]["id"] == str(row.id)

    patched = admin_client.patch(
        f"{POPUPS}{row.id}/", {"link_url": "", "is_active": False}, format="json"
    )
    assert patched.status_code == 200, patched.data
    assert patched.data["data"]["link_url"] == ""
    assert patched.data["data"]["is_active"] is False

    deleted = admin_client.delete(f"{POPUPS}{row.id}/")
    assert deleted.status_code == 200
    assert not PromotionPopup.objects.exists()
    assert admin_client.get(f"{POPUPS}{row.id}/").status_code == 404


def test_the_link_is_optional(admin_client):
    response = admin_client.post(POPUPS, _payload(sale()), format="multipart")

    assert response.status_code == 201, response.data
    assert response.data["data"]["link_url"] == ""


def test_admin_list_includes_switched_off_popups_newest_first(admin_client):
    offer = sale()
    older = popup(offer, is_active=False)
    newer = popup(offer)

    ids = [row["id"] for row in admin_client.get(POPUPS).data["data"]]

    assert ids == [str(newer.id), str(older.id)]


def test_an_image_is_required_on_create(admin_client):
    response = admin_client.post(POPUPS, {"sale_id": str(sale().id)}, format="multipart")

    assert response.status_code == 400
    assert _error(response) == "promotion_image_required"
    assert not PromotionPopup.objects.exists()


def test_the_image_can_be_replaced_but_not_removed(admin_client):
    row = popup(sale())
    old_path = Path(row.image.path)

    replaced = admin_client.patch(f"{POPUPS}{row.id}/", {"image": png("b.png")}, format="multipart")
    assert replaced.status_code == 200, replaced.data
    row.refresh_from_db()
    assert Path(row.image.path).exists()
    assert row.image.path != str(old_path)

    removed = admin_client.patch(f"{POPUPS}{row.id}/", {"image": None}, format="json")
    assert removed.status_code == 400
    assert _error(removed) == "promotion_image_required"
    row.refresh_from_db()
    assert row.image


def test_a_file_that_is_not_an_image_is_refused(admin_client):
    from django.core.files.uploadedfile import SimpleUploadedFile

    fake = SimpleUploadedFile("popup.png", b"not an image", content_type="image/png")
    response = admin_client.post(POPUPS, _payload(sale(), image=fake), format="multipart")

    assert response.status_code == 400
    assert not PromotionPopup.objects.exists()


@pytest.mark.parametrize(
    "url",
    ["javascript:alert(1)", "//evil.example/x", "/\\evil.example", "shop", "http://", "ftp://x.io"],
)
def test_unsafe_or_malformed_links_are_refused(admin_client, url):
    response = admin_client.post(POPUPS, _payload(sale(), link_url=url), format="multipart")

    assert response.status_code == 400
    assert "link_url" in response.data["error"]["fields"]


@pytest.mark.parametrize("url", ["/shop?collection=sale", "https://kullmart.com/offers"])
def test_site_paths_and_full_urls_are_accepted(admin_client, url):
    response = admin_client.post(POPUPS, _payload(sale(), link_url=url), format="multipart")

    assert response.status_code == 201, response.data
    assert response.data["data"]["link_url"] == url


def test_a_shop_popup_needs_a_sale(admin_client):
    response = admin_client.post(POPUPS, {"image": png()}, format="multipart")

    assert response.status_code == 400
    assert _error(response) == "promotion_sale_required"
    assert not PromotionPopup.objects.exists()


def test_an_unknown_or_deleted_sale_is_refused(admin_client, admin_user):
    from uuid import uuid4

    unknown = admin_client.post(POPUPS, _payload(sale(), sale_id=str(uuid4())), format="multipart")
    assert unknown.status_code == 404
    assert _error(unknown) == "sale_not_found"

    gone = sale()
    delete_sale(sale=gone, actor=admin_user)
    deleted = admin_client.post(POPUPS, _payload(gone), format="multipart")
    assert deleted.status_code == 404


def test_the_sale_can_be_switched(admin_client):
    row = popup(sale())
    other = sale(name="Puja offer")

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"sale_id": str(other.id)}, format="json")

    assert response.status_code == 200, response.data
    assert response.data["data"]["sale"]["name"] == "Puja offer"


def test_staff_without_settings_permission_is_forbidden(api_client):
    staff = create_user(email="popup-nobody@example.com", role="staff")
    row = popup(sale())
    api_client.force_authenticate(user=staff)

    assert api_client.get(POPUPS).status_code == 403
    assert api_client.get(f"{POPUPS}{row.id}/").status_code == 403
    assert api_client.post(POPUPS, {}, format="json").status_code == 403
    assert api_client.delete(f"{POPUPS}{row.id}/").status_code == 403


def test_settings_view_permission_reads_but_cannot_write(api_client):
    staff = create_user(email="popup-viewer@example.com", role="staff")
    set_staff_permission(
        staff_user=staff, permission_code=StaffPermissionCode.SETTINGS_VIEW, is_enabled=True
    )
    row = popup(sale())
    api_client.force_authenticate(user=staff)

    assert api_client.get(POPUPS).status_code == 200
    assert api_client.get(f"{POPUPS}{row.id}/").status_code == 200
    assert (
        api_client.patch(f"{POPUPS}{row.id}/", {"link_url": "/shop"}, format="json").status_code
        == 403
    )
    assert api_client.delete(f"{POPUPS}{row.id}/").status_code == 403


def test_customers_and_anonymous_visitors_are_refused(api_client, customer_user):
    assert api_client.get(POPUPS).status_code in (401, 403)
    api_client.force_authenticate(user=customer_user)
    assert api_client.get(POPUPS).status_code == 403
