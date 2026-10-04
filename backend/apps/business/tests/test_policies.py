"""Store policies: one source of truth, published only when complete in every
locale with a real effective date, and every change kept as a revision.

The text used here is test data, not business policy.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.urls import resolve, reverse
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.audit.models import AuditLog
from apps.business.constants import ModuleKey
from apps.business.models import PolicyKind, StorePolicy, StorePolicyRevision
from apps.business.selectors.policies import active_return_rules
from apps.business.services.modules import set_module_config
from apps.catalog.factories import CategoryFactory

pytestmark = pytest.mark.django_db

ADMIN_URL = "/api/v1/admin/settings/policies/"
PROFILE_URL = "/api/v1/admin/settings/business-profile/"


def public_url(kind: str) -> str:
    return f"/api/v1/public/policies/{kind}/"


def admin_url(kind: str) -> str:
    return f"{ADMIN_URL}{kind}/"


def bilingual(en: str, bn: str) -> dict:
    return {"en": en, "bn": bn}


def complete_content(marker: str = "v1") -> dict:
    return {
        "title": bilingual(f"Test title {marker}", f"Test title bn {marker}"),
        "intro": bilingual("", ""),
        "sections": [
            {
                "heading": bilingual("Test heading", "Test heading bn"),
                "body": bilingual(f"Test body {marker}", f"Test body bn {marker}"),
            }
        ],
    }


def today():
    return timezone.localdate()


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def publish(client, kind=PolicyKind.SHIPPING, **extra):
    payload = {
        "content": complete_content(),
        "effective_date": str(today()),
        "is_published": True,
        **extra,
    }
    response = client.patch(admin_url(kind), payload, format="json")
    assert response.status_code == 200, response.data
    return response


# --- Source of truth / defaults ----------------------------------------------


def test_migration_creates_one_empty_unpublished_row_per_kind():
    policies = list(StorePolicy.objects.order_by("kind"))

    assert sorted(policy.kind for policy in policies) == sorted(PolicyKind.values)
    for policy in policies:
        assert policy.is_published is False
        assert policy.content == {}
        assert policy.effective_date is None


@pytest.mark.parametrize("kind", PolicyKind.values)
def test_unpublished_policy_is_unavailable_not_blank(api_client, kind):
    response = api_client.get(public_url(kind))

    assert response.status_code == 404
    assert response.data["error"]["code"] == "policy_unavailable"


def test_unknown_policy_kind_is_404(api_client):
    response = api_client.get(public_url("privacy"))

    assert response.data["error"]["code"] == "policy_not_found"


def test_business_profile_no_longer_carries_policy_text(admin_client):
    data = admin_client.get(PROFILE_URL).data["data"]

    assert "shipping_policy" not in data
    assert "return_policy" not in data


# --- Publishing and the public response --------------------------------------


def test_published_bilingual_policy_reaches_the_public_endpoint(admin_client):
    effective = today() - timedelta(days=2)
    publish(admin_client, effective_date=str(effective))
    admin_client.force_authenticate(user=None)

    response = admin_client.get(public_url(PolicyKind.SHIPPING))

    assert response.status_code == 200
    data = response.data["data"]
    assert set(data) == {"kind", "title", "intro", "sections", "effective_date"}
    assert data["title"] == bilingual("Test title v1", "Test title bn v1")
    assert data["sections"][0]["body"]["bn"] == "Test body bn v1"
    assert data["effective_date"] == str(effective)


def test_effective_date_is_independent_of_profile_edits(admin_client):
    effective = today() - timedelta(days=10)
    publish(admin_client, effective_date=str(effective))

    admin_client.patch(PROFILE_URL, {"phone": "+8801700000000"}, format="json")
    StorePolicy.objects.filter(kind=PolicyKind.SHIPPING).update(updated_at=timezone.now())

    data = admin_client.get(public_url(PolicyKind.SHIPPING)).data["data"]
    assert data["effective_date"] == str(effective)


def test_return_policy_includes_toggle_and_enforced_rules(admin_client):
    category = CategoryFactory(name="Test category")
    publish(
        admin_client,
        kind=PolicyKind.RETURNS,
        return_window_days=5,
        preorder_returns_allowed=False,
        non_returnable_category_ids=[str(category.id)],
    )
    set_module_config(key=ModuleKey.ORDERS, config={"returns": False})

    data = admin_client.get(public_url(PolicyKind.RETURNS)).data["data"]

    assert data["returns_enabled"] is False
    assert data["eligibility"] == {
        "return_window_days": 5,
        "preorder_returns_allowed": False,
        "non_returnable_categories": [
            {"id": str(category.id), "name": "Test category", "slug": category.slug}
        ],
    }


def test_refund_policy_carries_no_return_specific_fields(admin_client):
    publish(admin_client, kind=PolicyKind.REFUND)

    data = admin_client.get(public_url(PolicyKind.REFUND)).data["data"]

    assert "returns_enabled" not in data
    assert "eligibility" not in data


def test_unpublishing_removes_the_policy_from_public(admin_client):
    publish(admin_client)

    admin_client.patch(admin_url(PolicyKind.SHIPPING), {"is_published": False}, format="json")

    assert admin_client.get(public_url(PolicyKind.SHIPPING)).status_code == 404


def test_public_read_rechecks_completeness(api_client):
    """A row forced published around the service still cannot surface blank text."""
    StorePolicy.objects.filter(kind=PolicyKind.SHIPPING).update(
        is_published=True,
        effective_date=today(),
        content={"title": bilingual("   ", " "), "sections": []},
    )

    assert api_client.get(public_url(PolicyKind.SHIPPING)).status_code == 404


def test_public_policy_endpoints_are_read_only(admin_client):
    url = public_url(PolicyKind.SHIPPING)

    assert admin_client.post(url, {}, format="json").status_code == 405
    assert admin_client.patch(url, {}, format="json").status_code == 405
    assert admin_client.delete(url).status_code == 405


def test_public_read_uses_a_bounded_number_of_queries(admin_client):
    categories = [CategoryFactory() for _ in range(5)]
    publish(
        admin_client,
        kind=PolicyKind.RETURNS,
        non_returnable_category_ids=[str(category.id) for category in categories],
    )
    admin_client.force_authenticate(user=None)

    with CaptureQueriesContext(connection) as queries:
        assert admin_client.get(public_url(PolicyKind.RETURNS)).status_code == 200

    # policy + category prefetch + module config; categories do not add queries.
    assert len(queries) <= 3


# --- Validation ---------------------------------------------------------------


@pytest.mark.parametrize(
    "content",
    [
        {},
        {"title": bilingual("   ", "   "), "sections": []},
        {
            "title": bilingual("Only English", ""),
            "sections": [{"heading": bilingual("H", "H"), "body": bilingual("B", "B")}],
        },
        {
            "title": bilingual("T", "T"),
            "sections": [{"heading": bilingual("H", "H"), "body": bilingual("B", "  ")}],
        },
        {
            "title": bilingual("T", "T"),
            "intro": bilingual("Intro in English only", ""),
            "sections": [{"heading": bilingual("H", "H"), "body": bilingual("B", "B")}],
        },
    ],
)
def test_incomplete_or_whitespace_policy_cannot_be_published(admin_client, content):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": content, "effective_date": str(today()), "is_published": True},
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "policy_incomplete"
    assert StorePolicy.objects.get(kind=PolicyKind.SHIPPING).is_published is False


def test_incomplete_draft_can_be_saved_and_reports_what_is_missing(admin_client):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": {"title": bilingual("Draft", "")}},
        format="json",
    )

    assert response.status_code == 200
    assert "content.title.bn" in response.data["data"]["missing_fields"]
    assert "content.sections" in response.data["data"]["missing_fields"]


@pytest.mark.parametrize(
    "content",
    [
        "plain text",
        {"title": {"fr": "Bonjour"}},
        {"title": bilingual("T", "T"), "footer": {}},
        {"title": bilingual("T", "T"), "sections": "not a list"},
        {"title": {"en": 5, "bn": "T"}},
        {"title": bilingual("x" * 201, "T")},
    ],
)
def test_malformed_content_is_rejected(admin_client, content):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING), {"content": content}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_policy_content"


def test_content_is_stored_stripped_and_with_every_locale(admin_client):
    admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": {"title": {"en": "  Padded  "}}},
        format="json",
    )

    content = StorePolicy.objects.get(kind=PolicyKind.SHIPPING).content
    assert content["title"] == {"en": "Padded", "bn": ""}
    assert content["intro"] == {"en": "", "bn": ""}


def test_publishing_requires_an_effective_date(admin_client):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": complete_content(), "is_published": True},
        format="json",
    )

    assert response.data["error"]["code"] == "effective_date_required"


def test_effective_date_cannot_be_in_the_future(admin_client):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {
            "content": complete_content(),
            "effective_date": str(today() + timedelta(days=1)),
            "is_published": True,
        },
        format="json",
    )

    assert response.data["error"]["code"] == "effective_date_in_future"


def test_changing_published_terms_requires_restating_the_date(admin_client):
    publish(admin_client)

    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING), {"content": complete_content("v2")}, format="json"
    )

    assert response.data["error"]["code"] == "effective_date_required"


def test_effective_date_cannot_move_backwards_while_published(admin_client):
    publish(admin_client)

    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": complete_content("v2"), "effective_date": str(today() - timedelta(days=1))},
        format="json",
    )

    assert response.data["error"]["code"] == "effective_date_backwards"


def test_return_rules_are_refused_on_other_policies(admin_client):
    response = admin_client.patch(
        admin_url(PolicyKind.SHIPPING), {"return_window_days": 3}, format="json"
    )

    assert response.data["error"]["code"] == "rules_not_applicable"


@pytest.mark.parametrize("days", [0, 366, -1])
def test_return_window_must_be_in_range(admin_client, days):
    response = admin_client.patch(
        admin_url(PolicyKind.RETURNS), {"return_window_days": days}, format="json"
    )

    assert response.data["error"]["code"] == "invalid_return_window"


def test_unknown_category_is_rejected(admin_client):
    response = admin_client.patch(
        admin_url(PolicyKind.RETURNS),
        {"non_returnable_category_ids": ["00000000-0000-0000-0000-000000000000"]},
        format="json",
    )

    assert response.data["error"]["code"] == "category_not_found"


def test_draft_return_rules_are_not_active():
    policy = StorePolicy.objects.get(kind=PolicyKind.RETURNS)
    policy.return_window_days = 3
    policy.save()

    assert active_return_rules() is None


# --- Revisions and audit -------------------------------------------------------


def test_each_change_records_a_revision_with_actor_and_before_after(admin_client, admin_user):
    publish(admin_client, effective_date=str(today() - timedelta(days=3)))
    admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": complete_content("v2"), "effective_date": str(today())},
        format="json",
    )

    first, second = StorePolicyRevision.objects.order_by("created_at")
    assert first.changed_by == admin_user
    assert first.previous["is_published"] is False
    assert first.current["is_published"] is True
    assert second.previous["content"]["title"]["en"] == "Test title v1"
    assert second.current["content"]["title"]["en"] == "Test title v2"
    assert second.previous["effective_date"] == str(today() - timedelta(days=3))
    assert second.effective_date == today()
    audit = AuditLog.objects.filter(action="store_policy.updated").order_by("created_at")
    assert [entry.metadata["revision_id"] for entry in audit] == [str(first.id), str(second.id)]
    assert all(entry.actor == admin_user for entry in audit)


def test_a_no_op_update_records_nothing(admin_client):
    publish(admin_client)
    published = StorePolicy.objects.get(kind=PolicyKind.SHIPPING)

    admin_client.patch(
        admin_url(PolicyKind.SHIPPING),
        {"content": published.content, "effective_date": str(published.effective_date)},
        format="json",
    )

    assert StorePolicyRevision.objects.count() == 1


def test_a_rejected_update_records_nothing(admin_client):
    admin_client.patch(admin_url(PolicyKind.SHIPPING), {"is_published": True}, format="json")

    assert not StorePolicyRevision.objects.exists()
    assert not AuditLog.objects.filter(action="store_policy.updated").exists()


def test_revision_list_is_paginated_and_query_count_is_flat(admin_client):
    publish(admin_client)
    url = f"{admin_url(PolicyKind.SHIPPING)}revisions/"
    with CaptureQueriesContext(connection) as small:
        assert admin_client.get(url).status_code == 200

    for marker in range(5):
        admin_client.patch(
            admin_url(PolicyKind.SHIPPING),
            {"content": complete_content(f"r{marker}"), "effective_date": str(today())},
            format="json",
        )
    with CaptureQueriesContext(connection) as large:
        response = admin_client.get(url)

    assert response.data["data"]["count"] == 6
    assert response.data["data"]["results"][0]["changed_by_name"]
    assert len(large) == len(small)


# --- Permissions across every write path --------------------------------------


def test_settings_view_staff_can_read_but_not_write(api_client, staff_user):
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.SETTINGS_VIEW, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(ADMIN_URL).status_code == 200
    assert api_client.get(f"{admin_url(PolicyKind.RETURNS)}revisions/").status_code == 200
    response = api_client.patch(
        admin_url(PolicyKind.RETURNS), {"content": complete_content()}, format="json"
    )
    assert response.status_code == 403
    assert not StorePolicyRevision.objects.exists()


def test_settings_manage_staff_can_publish(api_client, staff_user):
    set_staff_permission(
        staff_user=staff_user,
        permission_code=StaffPermissionCode.SETTINGS_MANAGE,
        is_enabled=True,
    )
    api_client.force_authenticate(user=staff_user)

    publish(api_client)

    assert StorePolicyRevision.objects.get().changed_by == staff_user


@pytest.mark.parametrize("role", ["customer", "anonymous"])
def test_customers_and_anonymous_cannot_reach_policy_admin(api_client, customer_user, role):
    if role == "customer":
        api_client.force_authenticate(user=customer_user)

    assert api_client.get(ADMIN_URL).status_code in (401, 403)
    response = api_client.patch(admin_url(PolicyKind.SHIPPING), {}, format="json")
    assert response.status_code in (401, 403)


def test_django_admin_cannot_change_policies(client, superuser):
    """The Django admin would skip validation and revisions, so it is read-only."""
    client.force_login(superuser)
    policy = StorePolicy.objects.get(kind=PolicyKind.SHIPPING)
    change_url = reverse("admin:business_storepolicy_change", args=[policy.pk])

    response = client.post(
        change_url,
        {"kind": "shipping", "content": "{}", "is_published": "on", "effective_date": "2020-01-01"},
    )

    assert client.get(change_url).status_code == 200  # viewable
    assert response.status_code == 403
    policy.refresh_from_db()
    assert policy.is_published is False
    assert not StorePolicyRevision.objects.exists()
    assert client.get(reverse("admin:business_storepolicy_add")).status_code == 403


@pytest.mark.parametrize(
    ("path", "view_name"),
    [
        ("/api/v1/public/checkout/shipping-quote/", "ShippingQuoteView"),
        ("/api/v1/public/checkout/shipping-options/", "ShippingOptionListView"),
        ("/api/v1/public/checkout/shipping-zones/", "ShippingZoneListView"),
        (
            "/api/v1/customer/orders/00000000-0000-0000-0000-000000000000/returns/",
            "RMAListCreateView",
        ),
    ],
)
def test_policy_routes_do_not_shadow_shipping_or_rma_endpoints(path, view_name):
    assert resolve(path).func.view_class.__name__ == view_name
