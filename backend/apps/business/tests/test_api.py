from __future__ import annotations

import pytest
from django.conf import settings

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.business.models import BusinessProfile
from apps.business.selectors import get_business_profile

pytestmark = pytest.mark.django_db

ENDPOINT = "/api/v1/admin/settings/business-profile/"


def test_first_read_seeds_the_singleton_from_settings(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.get(ENDPOINT)

    assert response.status_code == 200
    assert response.data["message"] == "Success"
    assert response.data["data"]["name"] == settings.BUSINESS_IDENTITY["name"]
    assert response.data["data"]["tax_id"] == ""
    assert BusinessProfile.objects.count() == 1


def test_repeated_access_never_creates_a_second_row(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    api_client.get(ENDPOINT)
    api_client.get(ENDPOINT)
    get_business_profile()

    assert BusinessProfile.objects.count() == 1


def test_patch_persists_identity_address_and_social(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(
        ENDPOINT,
        {
            "name": "Simple Admin Ltd",
            "district": "Khulna",
            "thana": "Sonadanga",
            "postcode": "9100",
            "country": "Bangladesh",
            "address_line": "New Market",
            "facebook_url": "https://facebook.com/simpleadmin",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["name"] == "Simple Admin Ltd"
    assert response.data["data"]["facebook_url"] == "https://facebook.com/simpleadmin"
    assert (
        response.data["data"]["formatted_address"]
        == "New Market, Sonadanga, Khulna, 9100, Bangladesh"
    )

    reread = api_client.get(ENDPOINT)
    assert reread.data["data"]["name"] == "Simple Admin Ltd"
    assert reread.data["data"]["thana"] == "Sonadanga"


def test_blank_is_allowed_everywhere_except_the_name(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    ok = api_client.patch(
        ENDPOINT,
        {"legal_name": "", "email": "", "website": "", "instagram_url": "", "tax_id": ""},
        format="json",
    )
    assert ok.status_code == 200

    blank_name = api_client.patch(ENDPOINT, {"name": ""}, format="json")
    assert blank_name.status_code == 400


def test_invalid_url_and_email_are_rejected(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    bad_url = api_client.patch(ENDPOINT, {"instagram_url": "not a url"}, format="json")
    assert bad_url.status_code == 400
    assert "instagram_url" in bad_url.data["error"]["fields"]

    bad_email = api_client.patch(ENDPOINT, {"email": "nope"}, format="json")
    assert bad_email.status_code == 400


def test_bare_domain_website_is_accepted_and_normalised(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)

    response = api_client.patch(ENDPOINT, {"website": "simpleadmin.com"}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["website"] == "https://simpleadmin.com"


def test_staff_without_settings_permission_is_forbidden(api_client):
    staff = create_user(email="settings-nobody@example.com", role="staff")
    api_client.force_authenticate(user=staff)

    assert api_client.get(ENDPOINT).status_code == 403
    assert api_client.patch(ENDPOINT, {"name": "Hijack"}, format="json").status_code == 403


def test_settings_view_permission_reads_but_cannot_write(api_client):
    staff = create_user(email="settings-viewer@example.com", role="staff")
    set_staff_permission(
        staff_user=staff, permission_code=StaffPermissionCode.SETTINGS_VIEW, is_enabled=True
    )
    api_client.force_authenticate(user=staff)

    assert api_client.get(ENDPOINT).status_code == 200
    assert api_client.patch(ENDPOINT, {"name": "Hijack"}, format="json").status_code == 403


def test_settings_manage_permission_can_write(api_client):
    staff = create_user(email="settings-manager@example.com", role="staff")
    set_staff_permission(
        staff_user=staff, permission_code=StaffPermissionCode.SETTINGS_MANAGE, is_enabled=True
    )
    api_client.force_authenticate(user=staff)

    assert api_client.patch(ENDPOINT, {"name": "Managed"}, format="json").status_code == 200


def test_anonymous_cannot_read_the_admin_endpoint(api_client):
    assert api_client.get(ENDPOINT).status_code in (401, 403)


def test_public_endpoint_needs_no_auth_and_hides_registration_data(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    api_client.patch(
        ENDPOINT,
        {
            "tax_id": "1234567890",
            "trade_licence_no": "TL-9",
            "tiktok_url": "https://tiktok.com/@ip",
        },
        format="json",
    )
    api_client.force_authenticate(user=None)

    response = api_client.get("/api/v1/public/business-profile/")

    assert response.status_code == 200
    data = response.data["data"]
    assert "tax_id" not in data
    assert "trade_licence_no" not in data
    assert data["social"]["tiktok"] == "https://tiktok.com/@ip"


def test_free_delivery_amount_is_set_by_staff_and_read_by_the_storefront(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    assert api_client.get(ENDPOINT).data["data"]["free_delivery_min_amount"] is None

    saved = api_client.patch(ENDPOINT, {"free_delivery_min_amount": "2500.00"}, format="json")
    negative = api_client.patch(ENDPOINT, {"free_delivery_min_amount": "-1"}, format="json")
    api_client.force_authenticate(user=None)
    public = api_client.get("/api/v1/public/business-profile/")

    assert saved.status_code == 200, saved.data
    assert saved.data["data"]["free_delivery_min_amount"] == "2500.00"
    assert negative.status_code == 400
    assert public.data["data"]["free_delivery_min_amount"] == "2500.00"

    api_client.force_authenticate(user=admin_user)
    cleared = api_client.patch(ENDPOINT, {"free_delivery_min_amount": None}, format="json")
    assert cleared.data["data"]["free_delivery_min_amount"] is None


def test_referral_amounts_are_set_by_staff_and_start_unset(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    first = api_client.get(ENDPOINT).data["data"]
    assert first["referral_friend_discount"] is None
    assert first["referral_reward_amount"] is None

    saved = api_client.patch(
        ENDPOINT,
        {"referral_friend_discount": "50.00", "referral_reward_amount": "30.00"},
        format="json",
    )
    negative = api_client.patch(ENDPOINT, {"referral_reward_amount": "-1"}, format="json")

    assert saved.status_code == 200, saved.data
    assert saved.data["data"]["referral_friend_discount"] == "50.00"
    assert saved.data["data"]["referral_reward_amount"] == "30.00"
    assert negative.status_code == 400


def test_preorder_terms_are_set_by_staff_and_read_by_the_storefront(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    assert api_client.get(ENDPOINT).data["data"]["preorder_terms_en"] == ""

    english = "Advance payment is non-refundable.\nDates may change."
    saved = api_client.patch(
        ENDPOINT,
        {"preorder_terms_en": f"  {english}  ", "preorder_terms_bn": "অগ্রিম অর্থ ফেরতযোগ্য নয়।"},
        format="json",
    )
    api_client.force_authenticate(user=None)
    public = api_client.get("/api/v1/public/business-profile/")

    assert saved.status_code == 200, saved.data
    # Line breaks kept; only the outer whitespace is trimmed.
    assert saved.data["data"]["preorder_terms_en"] == english
    assert public.data["data"]["preorder_terms"] == {
        "en": english,
        "bn": "অগ্রিম অর্থ ফেরতযোগ্য নয়।",
    }

    api_client.force_authenticate(user=admin_user)
    cleared = api_client.patch(ENDPOINT, {"preorder_terms_en": ""}, format="json")
    assert cleared.data["data"]["preorder_terms_en"] == ""
