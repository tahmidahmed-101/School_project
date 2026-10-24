"""The `preorder_checkout` store policy: the text shown before a shopper places
a pre-order. It is an ordinary store policy, so it is edited, published,
revised and audited exactly like the others, and sets no checkout rule.

The text used here is test data, not business policy.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.audit.models import AuditLog
from apps.business.models import PolicyKind, StorePolicy, StorePolicyRevision
from apps.business.selectors.policies import active_return_rules

pytestmark = pytest.mark.django_db

KIND = PolicyKind.PREORDER_CHECKOUT
ADMIN_LIST_URL = "/api/v1/admin/settings/policies/"
ADMIN_URL = f"{ADMIN_LIST_URL}preorder_checkout/"
REVISIONS_URL = f"{ADMIN_URL}revisions/"
PUBLIC_URL = "/api/v1/public/policies/preorder_checkout/"


def bilingual(en: str, bn: str) -> dict:
    return {"en": en, "bn": bn}


def content(marker: str = "v1") -> dict:
    return {
        "title": bilingual(f"Checkout title {marker}", f"Checkout title bn {marker}"),
        "intro": bilingual(f"Intro {marker}", f"Intro bn {marker}"),
        "sections": [
            {
                "heading": bilingual("First heading", "First heading bn"),
                "body": bilingual(f"First body {marker}", f"First body bn {marker}"),
            },
            {
                "heading": bilingual("Second heading", "Second heading bn"),
                "body": bilingual("Second body", "Second body bn"),
            },
        ],
    }


def today():
    return timezone.localdate()


@pytest.fixture
def admin_client(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    return api_client


def publish(client, **extra):
    payload = {
        "content": content(),
        "effective_date": str(today()),
        "is_published": True,
        **extra,
    }
    return client.patch(ADMIN_URL, payload, format="json")


def _error(response) -> str:
    return response.data["error"]["code"]


# --- Migration ---------------------------------------------------------------


def test_migration_creates_one_empty_unpublished_row():
    policy = StorePolicy.objects.get(kind="preorder_checkout")

    assert policy.content == {}
    assert policy.is_published is False
    assert policy.effective_date is None
    assert not policy.revisions.exists()


# --- Dashboard API -------------------------------------------------------------


def test_admin_lists_and_reads_the_draft(admin_client):
    kinds = [row["kind"] for row in admin_client.get(ADMIN_LIST_URL).data["data"]]
    detail = admin_client.get(ADMIN_URL)

    assert "preorder_checkout" in kinds
    assert detail.status_code == 200
    data = detail.data["data"]
    assert data["kind"] == "preorder_checkout"
    assert data["label"] == "Pre-order checkout terms"
    assert data["is_published"] is False
    assert data["return_rules"] is None
    assert "content.title" in data["missing_fields"]


def test_admin_publishes_complete_bilingual_content_with_revision_and_audit(
    admin_client, admin_user
):
    effective = today() - timedelta(days=1)

    response = publish(admin_client, effective_date=str(effective))

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["is_published"] is True
    assert data["effective_date"] == str(effective)
    assert data["missing_fields"] == []
    assert data["content"] == content()

    revision = StorePolicyRevision.objects.get(policy__kind=KIND)
    assert revision.changed_by == admin_user
    assert revision.previous["is_published"] is False
    assert revision.current["is_published"] is True
    assert revision.current["content"] == content()
    # Return rules are not part of this policy's snapshot.
    assert "preorder_returns_allowed" not in revision.current
    audit = AuditLog.objects.get(action="store_policy.updated")
    assert audit.actor == admin_user
    assert audit.metadata["kind"] == "preorder_checkout"
    assert audit.metadata["revision_id"] == str(revision.id)

    history = admin_client.get(REVISIONS_URL)
    assert history.status_code == 200
    assert [row["id"] for row in history.data["data"]["results"]] == [str(revision.id)]


def test_a_draft_can_be_saved_incomplete_and_stays_unpublished(admin_client):
    response = admin_client.patch(
        ADMIN_URL, {"content": {"title": bilingual("Only English", "")}}, format="json"
    )

    assert response.status_code == 200, response.data
    data = response.data["data"]
    assert data["is_published"] is False
    # English alone is enough for the title; only the sections are still missing.
    assert data["missing_fields"] == ["content.sections"]
    assert StorePolicyRevision.objects.filter(policy__kind=KIND).count() == 1


@pytest.mark.parametrize(
    "broken",
    [
        {"title": bilingual("", " ")},
        {"sections": []},
        {"sections": [{"heading": bilingual("Heading", "Heading bn"), "body": bilingual("", "")}]},
    ],
    ids=["blank-title", "no-sections", "blank-section-body"],
)
def test_incomplete_content_cannot_be_published(admin_client, broken):
    response = publish(admin_client, content={**content(), **broken})

    assert response.status_code == 400
    assert _error(response) == "policy_incomplete"
    policy = StorePolicy.objects.get(kind=KIND)
    assert policy.is_published is False
    assert not policy.revisions.exists()


@pytest.mark.parametrize(
    "bad",
    [
        {"title": "not localized"},
        {"title": bilingual("Title", "Title bn"), "footer": bilingual("x", "y")},
        {"title": {"en": "Title", "fr": "Titre"}},
    ],
    ids=["not-an-object", "unknown-field", "unknown-locale"],
)
def test_malformed_content_is_refused(admin_client, bad):
    response = admin_client.patch(ADMIN_URL, {"content": bad}, format="json")

    assert response.status_code == 400
    assert _error(response) == "invalid_policy_content"


def test_publishing_needs_a_date_that_has_arrived(admin_client):
    undated = publish(admin_client, effective_date=None)
    future = publish(admin_client, effective_date=str(today() + timedelta(days=1)))

    assert _error(undated) == "effective_date_required"
    assert _error(future) == "effective_date_in_future"
    assert StorePolicy.objects.get(kind=KIND).is_published is False


def test_return_rules_are_refused_on_this_policy(admin_client):
    response = admin_client.patch(ADMIN_URL, {"preorder_returns_allowed": False}, format="json")

    assert response.status_code == 400
    assert _error(response) == "rules_not_applicable"


def test_publishing_it_leaves_return_rules_untouched(admin_client):
    assert publish(admin_client).status_code == 200

    assert active_return_rules() is None
    assert StorePolicy.objects.get(kind=PolicyKind.RETURNS).is_published is False


# --- Permissions ---------------------------------------------------------------


def test_settings_view_staff_can_read_but_not_edit_or_publish(api_client, staff_user):
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.SETTINGS_VIEW, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(ADMIN_URL).status_code == 200
    assert api_client.get(REVISIONS_URL).status_code == 200
    assert api_client.patch(ADMIN_URL, {"content": content()}, format="json").status_code == 403
    assert publish(api_client).status_code == 403
    assert not StorePolicyRevision.objects.exists()


def test_staff_without_settings_permission_cannot_read(api_client, staff_user):
    api_client.force_authenticate(user=staff_user)

    assert api_client.get(ADMIN_URL).status_code == 403
    assert api_client.get(REVISIONS_URL).status_code == 403


def test_settings_manage_staff_can_edit_and_publish(api_client, staff_user):
    set_staff_permission(
        staff_user=staff_user, permission_code=StaffPermissionCode.SETTINGS_MANAGE, is_enabled=True
    )
    api_client.force_authenticate(user=staff_user)

    assert publish(api_client).status_code == 200
    assert StorePolicyRevision.objects.get(policy__kind=KIND).changed_by == staff_user


@pytest.mark.parametrize("role", ["customer", "anonymous"])
def test_customers_and_anonymous_cannot_reach_it_in_the_dashboard(api_client, customer_user, role):
    if role == "customer":
        api_client.force_authenticate(user=customer_user)

    assert api_client.get(ADMIN_URL).status_code in (401, 403)
    assert publish(api_client).status_code in (401, 403)


# --- Public API ------------------------------------------------------------------


def test_public_api_returns_the_published_policy(admin_client):
    effective = today() - timedelta(days=2)
    assert publish(admin_client, effective_date=str(effective)).status_code == 200
    admin_client.force_authenticate(user=None)

    response = admin_client.get(PUBLIC_URL)

    assert response.status_code == 200
    data = response.data["data"]
    assert data == {
        "kind": "preorder_checkout",
        "title": bilingual("Checkout title v1", "Checkout title bn v1"),
        "intro": bilingual("Intro v1", "Intro bn v1"),
        "sections": content()["sections"],
        "effective_date": str(effective),
    }
    assert response.data["message"] == "Success"


def test_public_api_hides_an_unpublished_policy(api_client):
    response = api_client.get(PUBLIC_URL)

    assert response.status_code == 404
    assert _error(response) == "policy_unavailable"


def test_public_api_hides_a_saved_but_unpublished_draft(admin_client):
    admin_client.patch(ADMIN_URL, {"content": content()}, format="json")
    admin_client.force_authenticate(user=None)

    response = admin_client.get(PUBLIC_URL)

    assert response.status_code == 404
    assert _error(response) == "policy_unavailable"


def test_public_api_hides_it_again_once_unpublished(admin_client):
    assert publish(admin_client).status_code == 200
    admin_client.patch(ADMIN_URL, {"is_published": False}, format="json")
    admin_client.force_authenticate(user=None)

    assert _error(admin_client.get(PUBLIC_URL)) == "policy_unavailable"


def test_public_api_rechecks_completeness(api_client):
    """A row forced published around the service still cannot surface blank text."""
    StorePolicy.objects.filter(kind=KIND).update(
        is_published=True,
        effective_date=today(),
        content={"title": bilingual("Title", ""), "sections": []},
    )

    response = api_client.get(PUBLIC_URL)

    assert response.status_code == 404
    assert _error(response) == "policy_unavailable"


def test_public_api_answers_unavailable_when_the_row_is_missing(api_client):
    StorePolicy.objects.filter(kind=KIND).delete()

    response = api_client.get(PUBLIC_URL)

    assert response.status_code == 404
    assert _error(response) == "policy_unavailable"
