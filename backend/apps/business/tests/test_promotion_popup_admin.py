"""Dashboard API for promotion popups: settings permissions, CRUD and the
rules a campaign must meet before it is saved."""

from __future__ import annotations

from pathlib import Path

import pytest

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.business.models import PromotionPopup
from apps.catalog.factories import CategoryFactory
from apps.catalog.services.sales import delete_sale

from .promotions import POPUPS, png, popup, preorder_product, sale, stock_product, window

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _payload(sale_row, products, **overrides) -> dict:
    dates = window()
    return {
        "name": "Eid popup",
        "title_en": "Eid sale",
        "title_bn": "ঈদ সেল",
        "body_en": "Up to 20% off",
        "body_bn": "২০% পর্যন্ত ছাড়",
        "cta_label_en": "Shop now",
        "cta_label_bn": "এখনই কিনুন",
        "cta_url": "/shop?sale=eid",
        "sale_id": str(sale_row.id),
        "product_ids": [str(product.id) for product in products],
        "starts_at": dates["starts_at"].isoformat(),
        "ends_at": dates["ends_at"].isoformat(),
        "priority": 5,
        **overrides,
    }


def _error(response) -> str:
    return response.data["error"]["code"]


def test_admin_creates_reads_lists_updates_and_deletes_a_popup(admin_client):
    offer = sale()
    first, second = stock_product(), stock_product()

    created = admin_client.post(
        POPUPS, {**_payload(offer, [second, first]), "image": png()}, format="multipart"
    )
    assert created.status_code == 201, created.data
    data = created.data["data"]
    row = PromotionPopup.objects.get()
    assert data["name"] == "Eid popup"
    assert (data["title_en"], data["title_bn"]) == ("Eid sale", "ঈদ সেল")
    assert data["cta_url"] == "/shop?sale=eid"
    assert data["priority"] == 5
    assert data["is_active"] is True
    assert data["image"] == f"http://testserver{row.image.url}"
    assert row.image.name.startswith("promotions/")
    assert data["sale"] == {
        "id": str(offer.id),
        "name": "Eid offer",
        "percent_off": "20.00",
        "status": "running",
    }
    # Kept in the order staff chose them.
    assert [item["id"] for item in data["products"]] == [str(second.id), str(first.id)]

    detail = admin_client.get(f"{POPUPS}{row.id}/")
    assert detail.status_code == 200
    assert detail.data["data"]["id"] == str(row.id)

    patched = admin_client.patch(
        f"{POPUPS}{row.id}/",
        {"title_en": "Eid mega sale", "product_ids": [str(first.id)], "is_active": False},
        format="json",
    )
    assert patched.status_code == 200, patched.data
    assert patched.data["data"]["title_en"] == "Eid mega sale"
    assert patched.data["data"]["is_active"] is False
    assert [item["id"] for item in patched.data["data"]["products"]] == [str(first.id)]
    assert patched.data["data"]["name"] == "Eid popup"

    deleted = admin_client.delete(f"{POPUPS}{row.id}/")
    assert deleted.status_code == 200
    assert not PromotionPopup.objects.exists()
    assert admin_client.get(f"{POPUPS}{row.id}/").status_code == 404


def test_admin_list_includes_switched_off_scheduled_and_ended_popups(admin_client):
    offer = sale()
    product = stock_product()
    popup(offer, [product], name="Off", is_active=False)
    popup(offer, [product], name="Scheduled", **window(starts_in_days=3, ends_in_days=9))
    popup(offer, [product], name="Ended", **window(starts_in_days=-9, ends_in_days=-3))
    popup(offer, [product], name="Live", priority=1)

    names = [row["name"] for row in admin_client.get(POPUPS).data["data"]]

    assert sorted(names) == ["Ended", "Live", "Off", "Scheduled"]
    assert names[0] == "Live"  # highest priority first


def test_replacing_and_removing_the_image(admin_client):
    row = popup(sale(), [stock_product()])

    first = admin_client.patch(f"{POPUPS}{row.id}/", {"image": png("a.png")}, format="multipart")
    assert first.status_code == 200, first.data
    row.refresh_from_db()
    old_path = Path(row.image.path)
    assert old_path.exists()

    second = admin_client.patch(f"{POPUPS}{row.id}/", {"image": png("b.png")}, format="multipart")
    assert second.status_code == 200
    row.refresh_from_db()
    assert Path(row.image.path).exists()
    assert row.image.path != str(old_path)

    removed = admin_client.patch(f"{POPUPS}{row.id}/", {"image": None}, format="json")
    assert removed.status_code == 200
    assert removed.data["data"]["image"] is None


def test_a_file_that_is_not_an_image_is_refused(admin_client):
    from django.core.files.uploadedfile import SimpleUploadedFile

    fake = SimpleUploadedFile("popup.png", b"not an image", content_type="image/png")
    response = admin_client.post(
        POPUPS, {**_payload(sale(), [stock_product()]), "image": fake}, format="multipart"
    )

    assert response.status_code == 400
    assert not PromotionPopup.objects.exists()


@pytest.mark.parametrize(
    "url",
    ["javascript:alert(1)", "//evil.example/x", "/\\evil.example", "shop", "http://", "ftp://x.io"],
)
def test_unsafe_or_malformed_cta_links_are_refused(admin_client, url):
    response = admin_client.post(
        POPUPS, _payload(sale(), [stock_product()], cta_url=url), format="json"
    )

    assert response.status_code == 400
    assert "cta_url" in response.data["error"]["fields"]


@pytest.mark.parametrize("url", ["/shop?sale=eid", "https://kullmart.com/eid", ""])
def test_site_paths_and_full_urls_are_accepted(admin_client, url):
    overrides = {"cta_url": url}
    if not url:
        overrides |= {"cta_label_en": "", "cta_label_bn": ""}
    response = admin_client.post(
        POPUPS, _payload(sale(), [stock_product()], **overrides), format="json"
    )

    assert response.status_code == 201, response.data


def test_a_button_label_needs_a_link(admin_client):
    response = admin_client.post(
        POPUPS, _payload(sale(), [stock_product()], cta_url=""), format="json"
    )

    assert response.status_code == 400
    assert _error(response) == "promotion_cta_url_required"


def test_a_popup_must_end_after_it_starts(admin_client):
    dates = window()
    response = admin_client.post(
        POPUPS,
        _payload(
            sale(),
            [stock_product()],
            starts_at=dates["ends_at"].isoformat(),
            ends_at=dates["starts_at"].isoformat(),
        ),
        format="json",
    )
    assert response.status_code == 400
    assert _error(response) == "promotion_window_invalid"

    row = popup(sale(), [stock_product()])
    patched = admin_client.patch(
        f"{POPUPS}{row.id}/", {"ends_at": row.starts_at.isoformat()}, format="json"
    )
    assert patched.status_code == 400
    assert _error(patched) == "promotion_window_invalid"


def test_required_fields_on_create(admin_client):
    response = admin_client.post(POPUPS, {}, format="json")

    assert response.status_code == 400
    fields = set(response.data["error"]["fields"])
    assert {"name", "title_en", "starts_at", "ends_at"} <= fields
    assert "product_ids" not in fields  # optional


def test_a_shop_popup_needs_a_sale(admin_client):
    payload = _payload(sale(), [])
    del payload["sale_id"]

    response = admin_client.post(POPUPS, payload, format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_sale_required"


def test_a_popup_can_be_created_without_products_and_have_them_removed(admin_client):
    offer = sale()
    payload = _payload(offer, [])
    del payload["product_ids"]

    created = admin_client.post(POPUPS, payload, format="json")
    assert created.status_code == 201, created.data
    assert created.data["data"]["products"] == []

    empty_list = admin_client.post(POPUPS, _payload(offer, [], product_ids=[]), format="json")
    assert empty_list.status_code == 201, empty_list.data

    row = popup(offer, [stock_product()])
    cleared = admin_client.patch(f"{POPUPS}{row.id}/", {"product_ids": []}, format="json")
    assert cleared.status_code == 200, cleared.data
    assert cleared.data["data"]["products"] == []
    assert not row.featured.exists()


def test_an_unknown_or_deleted_sale_is_refused(admin_client, admin_user):
    from uuid import uuid4

    product = stock_product()
    unknown = admin_client.post(
        POPUPS, _payload(sale(), [product], sale_id=str(uuid4())), format="json"
    )
    assert unknown.status_code == 404
    assert _error(unknown) == "sale_not_found"

    gone = sale()
    delete_sale(sale=gone, actor=admin_user)
    deleted = admin_client.post(POPUPS, _payload(gone, [product]), format="json")
    assert deleted.status_code == 404


def test_product_selection_is_checked(admin_client):
    from uuid import uuid4

    offer = sale()
    product = stock_product()

    repeated = admin_client.post(POPUPS, _payload(offer, [product, product]), format="json")
    assert _error(repeated) == "promotion_products_repeated"

    unknown = admin_client.post(
        POPUPS, _payload(offer, [product], product_ids=[str(uuid4())]), format="json"
    )
    assert unknown.status_code == 400
    assert _error(unknown) == "invalid_target"

    preorder = admin_client.post(POPUPS, _payload(offer, [preorder_product()]), format="json")
    assert preorder.status_code == 400
    assert _error(preorder) == "promotion_product_not_stock"
    assert not PromotionPopup.objects.exists()


def test_products_the_sale_does_not_cover_are_refused(admin_client):
    covered_category = CategoryFactory(category_type="stock")
    covered = stock_product(product__category=covered_category)
    outside = stock_product()
    category_sale = sale(applies_to="categories", category_ids=[covered_category.id])

    response = admin_client.post(POPUPS, _payload(category_sale, [covered, outside]), format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_product_not_in_sale"
    assert outside.name in response.data["error"]["message"]
    assert (
        admin_client.post(POPUPS, _payload(category_sale, [covered]), format="json").status_code
        == 201
    )


def test_switching_the_sale_rechecks_the_featured_products(admin_client):
    product = stock_product()
    row = popup(sale(), [product])
    narrow = sale(applies_to="products", product_ids=[stock_product().id], name="Narrow")

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"sale_id": str(narrow.id)}, format="json")

    assert response.status_code == 400
    assert _error(response) == "promotion_product_not_in_sale"
    row.refresh_from_db()
    assert row.sale_id != narrow.id


def test_staff_without_settings_permission_is_forbidden(api_client):
    staff = create_user(email="popup-nobody@example.com", role="staff")
    row = popup(sale(), [stock_product()])
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
    row = popup(sale(), [stock_product()])
    api_client.force_authenticate(user=staff)

    assert api_client.get(POPUPS).status_code == 200
    assert api_client.get(f"{POPUPS}{row.id}/").status_code == 200
    assert (
        api_client.patch(f"{POPUPS}{row.id}/", {"title_en": "No"}, format="json").status_code == 403
    )
    assert api_client.delete(f"{POPUPS}{row.id}/").status_code == 403


def test_customers_and_anonymous_visitors_are_refused(api_client, customer_user):
    assert api_client.get(POPUPS).status_code in (401, 403)
    api_client.force_authenticate(user=customer_user)
    assert api_client.get(POPUPS).status_code == 403
