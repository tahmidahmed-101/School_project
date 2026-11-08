"""Dashboard API for promotion popups: settings permissions, CRUD and the
rules a popup campaign must meet before it is saved."""

from __future__ import annotations

from datetime import timedelta
from pathlib import Path

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.business.models import PromotionPopup
from apps.catalog.factories import CategoryFactory, ProductFactory

from .promotions import POPUPS, png, popup, sale

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _media_root(settings, tmp_path):
    settings.MEDIA_ROOT = tmp_path


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def _payload(**overrides) -> dict:
    return {
        "name": "October Gadget Sale",
        "shop": "stock",
        "destination_type": "url",
        "link_url": "/shop",
        "image": png(),
        **overrides,
    }


def _error(response) -> str:
    return response.data["error"]["code"]


def _field_errors(response) -> dict:
    return response.data["error"]["fields"]


def test_admin_creates_reads_lists_updates_and_deletes_a_campaign(
    admin_client, django_capture_on_commit_callbacks
):
    starts = timezone.now() - timedelta(hours=1)
    ends = timezone.now() + timedelta(days=3)

    created = admin_client.post(
        POPUPS,
        _payload(
            priority=5,
            starts_at=starts.isoformat(),
            ends_at=ends.isoformat(),
        ),
        format="multipart",
    )

    assert created.status_code == 201, created.data
    data = created.data["data"]
    row = PromotionPopup.objects.get()
    assert data["name"] == "October Gadget Sale"
    assert "description" not in data
    assert data["is_active"] is True
    assert data["display_status"] == "active"
    assert data["priority"] == 5
    assert data["shop"] == "stock"
    assert data["destination_type"] == "url"
    assert data["link_url"] == "/shop"
    assert data["product"] is None
    assert data["category"] is None
    assert data["sale"] is None
    assert data["image"] == f"http://testserver{row.image.url}"

    assert admin_client.get(f"{POPUPS}{row.id}/").data["data"]["id"] == str(row.id)
    assert [item["id"] for item in admin_client.get(POPUPS).data["data"]] == [str(row.id)]

    updated = admin_client.patch(f"{POPUPS}{row.id}/", {"is_active": False}, format="json")
    assert updated.status_code == 200, updated.data
    assert updated.data["data"]["display_status"] == "inactive"

    image_path = Path(row.image.path)
    with django_capture_on_commit_callbacks(execute=True):
        assert admin_client.delete(f"{POPUPS}{row.id}/").status_code == 200
    assert not PromotionPopup.objects.exists()
    assert not image_path.exists()


def test_new_campaign_is_active_without_a_link_by_default(admin_client):
    payload = _payload()
    for field in ("destination_type", "link_url"):
        del payload[field]

    response = admin_client.post(POPUPS, payload, format="multipart")

    assert response.status_code == 201, response.data
    data = response.data["data"]
    assert data["is_active"] is True
    assert data["display_status"] == "active"
    assert data["priority"] == 0
    assert data["destination_type"] == "none"
    assert data["link_url"] == ""
    assert data["starts_at"] is None
    assert data["ends_at"] is None


@pytest.mark.parametrize(
    ("starts_in", "ends_in", "expected"),
    [
        (timedelta(days=1), None, "scheduled"),
        (None, timedelta(days=-1), "expired"),
        (timedelta(days=-1), timedelta(days=1), "active"),
    ],
)
def test_display_status_follows_the_schedule(admin_client, starts_in, ends_in, expected):
    now = timezone.now()
    row = popup(
        starts_at=now + starts_in if starts_in else None,
        ends_at=now + ends_in if ends_in else None,
    )

    response = admin_client.get(f"{POPUPS}{row.id}/")

    assert response.data["data"]["display_status"] == expected


def test_each_destination_type_keeps_only_its_own_target(admin_client):
    product = ProductFactory(is_active=True)
    category = CategoryFactory()
    offer = sale()

    for destination, field, value in [
        ("product", "product_id", product.id),
        ("category", "category_id", category.id),
        ("campaign", "sale_id", offer.id),
    ]:
        response = admin_client.post(
            POPUPS,
            _payload(destination_type=destination, **{field: str(value)}),
            format="multipart",
        )
        assert response.status_code == 201, response.data
        data = response.data["data"]
        assert data["link_url"] == ""
        assert data["product"] == (
            {"id": str(product.id), "name": product.name, "slug": product.slug, "image": None}
            if destination == "product"
            else None
        )
        assert (data["category"] or {}).get("id") == (
            str(category.id) if destination == "category" else None
        )
        assert (data["sale"] or {}).get("id") == (
            str(offer.id) if destination == "campaign" else None
        )


def test_no_link_clears_every_target(admin_client):
    product = ProductFactory(is_active=True)
    row = popup(destination_type="product", product=product, link_url="")

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"destination_type": "none"}, format="json")

    assert response.status_code == 200, response.data
    row.refresh_from_db()
    assert row.product is None
    assert response.data["data"]["product"] is None


def test_switching_destination_clears_the_old_target(admin_client):
    product = ProductFactory(is_active=True)
    row = popup(destination_type="product", product=product, link_url="")

    response = admin_client.patch(
        f"{POPUPS}{row.id}/",
        {"destination_type": "url", "link_url": "https://example.com/offer"},
        format="json",
    )

    assert response.status_code == 200, response.data
    row.refresh_from_db()
    assert row.product is None
    assert row.link_url == "https://example.com/offer"


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"destination_type": "product"}, "product_id"),
        ({"destination_type": "category"}, "category_id"),
        ({"destination_type": "campaign"}, "sale_id"),
        ({"destination_type": "url", "link_url": ""}, "link_url"),
    ],
)
def test_destination_type_needs_its_target(admin_client, overrides, field):
    response = admin_client.post(POPUPS, _payload(**overrides), format="multipart")

    assert response.status_code == 400
    assert _error(response) == "promotion_destination_required"
    assert field in _field_errors(response)
    assert not PromotionPopup.objects.exists()


def test_end_must_be_after_start(admin_client):
    now = timezone.now()
    response = admin_client.post(
        POPUPS,
        _payload(starts_at=now.isoformat(), ends_at=(now - timedelta(hours=1)).isoformat()),
        format="multipart",
    )

    assert response.status_code == 400
    assert "ends_at" in _field_errors(response)


def test_a_partial_update_is_held_to_the_schedule_rule(admin_client):
    now = timezone.now()
    row = popup(starts_at=now)

    response = admin_client.patch(
        f"{POPUPS}{row.id}/", {"ends_at": (now - timedelta(days=1)).isoformat()}, format="json"
    )

    assert response.status_code == 400
    assert "ends_at" in _field_errors(response)


@pytest.mark.parametrize(
    ("overrides", "field"),
    [
        ({"name": ""}, "name"),
        ({"shop": "outlet"}, "shop"),
        ({"priority": -1}, "priority"),
        ({"link_url": "javascript:alert(1)"}, "link_url"),
    ],
)
def test_invalid_fields_are_refused(admin_client, overrides, field):
    response = admin_client.post(POPUPS, _payload(**overrides), format="multipart")

    assert response.status_code == 400
    assert field in _field_errors(response)


def test_a_popup_stays_in_the_stock_shop(admin_client):
    row = popup()

    response = admin_client.patch(f"{POPUPS}{row.id}/", {"shop": "outlet"}, format="json")

    assert response.status_code == 400
    row.refresh_from_db()
    assert row.shop == "stock"


def test_list_can_be_narrowed_to_the_stock_shop(admin_client):
    stock = popup()

    def ids(shop):
        return [item["id"] for item in admin_client.get(POPUPS, {"shop": shop}).data["data"]]

    assert ids("stock") == [str(stock.id)]
    # The pre-order shop is gone: asking for it is a 400 like any unknown shop.
    assert admin_client.get(POPUPS, {"shop": "preorder"}).status_code == 400
    assert admin_client.get(POPUPS, {"shop": "outlet"}).status_code == 400


def test_create_needs_an_image(admin_client):
    payload = _payload()
    del payload["image"]

    response = admin_client.post(POPUPS, payload, format="multipart")

    assert response.status_code == 400
    assert _error(response) == "promotion_image_required"


def test_a_new_image_replaces_the_old_file(admin_client, django_capture_on_commit_callbacks):
    row = popup()
    old_path = Path(row.image.path)

    with django_capture_on_commit_callbacks(execute=True):
        response = admin_client.patch(
            f"{POPUPS}{row.id}/", {"image": png("new.png")}, format="multipart"
        )

    assert response.status_code == 200, response.data
    row.refresh_from_db()
    assert Path(row.image.path) != old_path
    assert not old_path.exists()


def test_unknown_product_is_refused(admin_client):
    response = admin_client.post(
        POPUPS,
        _payload(destination_type="product", product_id="00000000-0000-0000-0000-000000000000"),
        format="multipart",
    )

    assert response.status_code == 400
    assert _error(response) == "product_not_found"
    assert "product_id" in _field_errors(response)


def test_list_puts_the_highest_priority_first(admin_client):
    low = popup(name="Low", priority=1)
    high = popup(name="High", priority=9)

    response = admin_client.get(POPUPS)

    assert [item["id"] for item in response.data["data"]] == [str(high.id), str(low.id)]


def test_staff_without_settings_permission_is_forbidden(api_client):
    staff = create_user(email="popup-nobody@example.com", role="staff")
    row = popup()
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
    row = popup()
    api_client.force_authenticate(user=staff)

    assert api_client.get(POPUPS).status_code == 200
    assert api_client.get(f"{POPUPS}{row.id}/").status_code == 200
    assert (
        api_client.patch(f"{POPUPS}{row.id}/", {"status": "paused"}, format="json").status_code
        == 403
    )
    assert api_client.delete(f"{POPUPS}{row.id}/").status_code == 403


def test_customers_and_anonymous_visitors_are_refused(api_client, customer_user):
    assert api_client.get(POPUPS).status_code in (401, 403)
    api_client.force_authenticate(user=customer_user)
    assert api_client.get(POPUPS).status_code == 403
