from __future__ import annotations

import json
from unittest.mock import patch

import pytest
from cryptography.fernet import Fernet
from django.db import connection, transaction
from django.test.utils import CaptureQueriesContext

from apps.accounting.tests.helpers import seed_chart_of_accounts
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.audit.models import AuditLog
from apps.common.utils.secrets import decrypt_secret
from apps.marketing.models import ConversionEvent, ConversionProviderSetting
from apps.marketing.selectors.conversion_settings import load_credentials
from apps.marketing.services.conversions import record_purchase, retry_conversion_events
from apps.marketing.tests.test_conversions import URLOPEN, _checked_out, _ok

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/settings/conversion-tracking/"
GA4_SECRET = "ga4DashboardSecret_123"
META_TOKEN = "EAAB" + "x" * 60
KEY = Fernet.generate_key().decode()


@pytest.fixture(autouse=True)
def _setup(settings):
    seed_chart_of_accounts()
    settings.SECRETS_ENCRYPTION_KEYS = [KEY]


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(user=create_user(email="owner@example.com", role=UserRole.ADMIN))
    return api_client


def _staff_client(api_client, *codes):
    staff = create_user(email=f"staff-{'-'.join(codes) or 'none'}@example.com", role=UserRole.STAFF)
    for code in codes:
        set_staff_permission(staff_user=staff, permission_code=code, is_enabled=True)
    api_client.force_authenticate(user=staff)
    return api_client


def _save_ga4(client, **extra):
    return client.patch(
        f"{URL}ga4/",
        {"tracking_id": "G-DASH1234", "secret": GA4_SECRET, **extra},
        format="json",
    )


def _state(client, provider):
    rows = client.get(URL).data["data"]
    return next(row for row in rows if row["provider"] == provider)


# --- Permissions ------------------------------------------------------------


def test_anonymous_and_customers_cannot_see_the_settings(api_client):
    assert api_client.get(URL).status_code in (401, 403)
    api_client.force_authenticate(user=create_user(email="shopper@example.com"))
    assert api_client.get(URL).status_code == 403


def test_staff_need_settings_view_to_read_and_settings_manage_to_write(api_client):
    client = _staff_client(api_client)
    assert client.get(URL).status_code == 403

    client = _staff_client(api_client, StaffPermissionCode.SETTINGS_VIEW)
    assert client.get(URL).status_code == 200
    assert _save_ga4(client).status_code == 403
    assert client.delete(f"{URL}ga4/").status_code == 403

    client = _staff_client(api_client, StaffPermissionCode.SETTINGS_MANAGE)
    assert _save_ga4(client).status_code == 200


# --- Secrets never come back --------------------------------------------------


def test_saved_secrets_are_never_returned_or_audited(admin_client):
    saved = _save_ga4(admin_client)
    admin_client.patch(
        f"{URL}meta/", {"tracking_id": "1234567890", "secret": META_TOKEN}, format="json"
    )
    listing = admin_client.get(URL)

    for body in (saved.content, listing.content):
        assert GA4_SECRET.encode() not in body
        assert META_TOKEN.encode() not in body
    ga4 = _state(admin_client, "ga4")
    assert (ga4["source"], ga4["secret_status"], ga4["is_active"]) == ("dashboard", "set", True)
    assert ga4["tracking_id"] == "G-DASH1234"
    audit = json.dumps(list(AuditLog.objects.values_list("metadata", flat=True)))
    assert GA4_SECRET not in audit and META_TOKEN not in audit


def test_a_rejected_secret_is_not_echoed_in_the_error(admin_client):
    response = admin_client.patch(
        f"{URL}meta/", {"tracking_id": "1234567890", "secret": "short secret"}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "invalid_secret"
    assert b"short secret" not in response.content


# --- Encryption -------------------------------------------------------------


def test_secrets_are_stored_encrypted(admin_client):
    _save_ga4(admin_client)

    row = ConversionProviderSetting.objects.get(provider="ga4")
    assert GA4_SECRET not in row.secret_ciphertext
    assert decrypt_secret(row.secret_ciphertext) == GA4_SECRET


def test_a_rotated_key_still_reads_secrets_saved_under_the_old_one(admin_client, settings):
    _save_ga4(admin_client)
    settings.SECRETS_ENCRYPTION_KEYS = [Fernet.generate_key().decode(), KEY]

    assert load_credentials()["ga4"].secret == GA4_SECRET


def test_a_lost_key_marks_the_secret_unreadable_and_sends_nothing(admin_client, settings):
    _save_ga4(admin_client)
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)
    settings.SECRETS_ENCRYPTION_KEYS = [Fernet.generate_key().decode()]

    state = _state(admin_client, "ga4")
    with patch(URLOPEN) as urlopen:
        retry_conversion_events()

    assert (state["secret_status"], state["is_active"]) == ("unreadable", False)
    urlopen.assert_not_called()
    assert ConversionEvent.objects.get(provider="ga4").status == "failed"


def test_secrets_cannot_be_saved_without_an_encryption_key(admin_client, settings):
    settings.SECRETS_ENCRYPTION_KEYS = []

    response = _save_ga4(admin_client)

    assert response.status_code == 400
    assert response.data["error"]["code"] == "encryption_key_missing"
    assert not ConversionProviderSetting.objects.exists()


# --- Validation -------------------------------------------------------------


@pytest.mark.parametrize(
    ("provider", "payload", "code"),
    [
        ("ga4", {"tracking_id": "UA-12345", "secret": GA4_SECRET}, "invalid_tracking_id"),
        ("meta", {"tracking_id": "pixel-abc", "secret": META_TOKEN}, "invalid_tracking_id"),
        ("ga4", {"tracking_id": "G-DASH1234"}, "credentials_required"),
        ("ga4", {"secret": GA4_SECRET}, "credentials_required"),
        (
            "ga4",
            {"tracking_id": "G-DASH1234", "secret": GA4_SECRET, "test_event_code": "TEST1"},
            "test_event_code_not_supported",
        ),
        (
            "meta",
            {"tracking_id": "1234567890", "secret": META_TOKEN, "test_event_code": "bad code!"},
            "invalid_test_event_code",
        ),
    ],
)
def test_invalid_settings_are_refused(admin_client, provider, payload, code):
    response = admin_client.patch(f"{URL}{provider}/", payload, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == code
    assert not ConversionProviderSetting.objects.exists()


def test_unknown_providers_and_empty_updates_are_refused(admin_client):
    assert (
        admin_client.patch(f"{URL}tiktok/", {"is_enabled": True}, format="json").status_code == 404
    )
    assert admin_client.patch(f"{URL}ga4/", {}, format="json").status_code == 400


def test_a_measurement_id_is_normalised_to_upper_case(admin_client):
    _save_ga4(admin_client, tracking_id="g-dash1234")

    assert ConversionProviderSetting.objects.get().tracking_id == "G-DASH1234"


def test_other_fields_change_without_re_entering_the_secret(admin_client):
    _save_ga4(admin_client)
    ciphertext = ConversionProviderSetting.objects.get().secret_ciphertext

    response = admin_client.patch(f"{URL}ga4/", {"tracking_id": "G-OTHER999"}, format="json")

    assert response.status_code == 200
    row = ConversionProviderSetting.objects.get()
    assert (row.tracking_id, row.secret_ciphertext) == ("G-OTHER999", ciphertext)


# --- Enable / disable and environment precedence ------------------------------


def test_with_nothing_saved_the_environment_applies_as_before(admin_client, settings):
    settings.GA4_MEASUREMENT_ID = "G-ENV12345"
    settings.GA4_API_SECRET = "env-secret-value"

    ga4 = _state(admin_client, "ga4")
    meta = _state(admin_client, "meta")

    assert (ga4["source"], ga4["is_active"], ga4["tracking_id"]) == (
        "environment",
        True,
        "G-ENV12345",
    )
    assert (meta["source"], meta["is_active"]) == ("none", False)
    assert b"env-secret-value" not in admin_client.get(URL).content


def test_saved_settings_take_precedence_over_the_environment(admin_client, settings):
    settings.GA4_MEASUREMENT_ID = "G-ENV12345"
    settings.GA4_API_SECRET = "env-secret-value"
    _save_ga4(admin_client)
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        retry_conversion_events()

    url = urlopen.call_args.args[0].full_url
    assert "measurement_id=G-DASH1234" in url and GA4_SECRET in url
    assert "env-secret-value" not in url


def test_switching_a_provider_off_overrides_the_environment(admin_client, settings):
    settings.META_PIXEL_ID = "9876543210"
    settings.META_CAPI_ACCESS_TOKEN = "env-token-value-long-enough"

    response = admin_client.patch(f"{URL}meta/", {"is_enabled": False}, format="json")
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)

    assert (response.data["data"]["source"], response.data["data"]["is_active"]) == (
        "dashboard",
        False,
    )
    assert not ConversionEvent.objects.filter(provider="meta").exists()


def test_a_provider_cannot_be_switched_on_without_its_secret(admin_client):
    admin_client.patch(f"{URL}meta/", {"is_enabled": False}, format="json")

    response = admin_client.patch(
        f"{URL}meta/", {"tracking_id": "1234567890", "is_enabled": True}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "credentials_required"


def test_disabling_and_re_enabling_a_saved_provider(admin_client):
    _save_ga4(admin_client)

    off = admin_client.patch(f"{URL}ga4/", {"is_enabled": False}, format="json")
    on = admin_client.patch(f"{URL}ga4/", {"is_enabled": True}, format="json")

    assert off.data["data"]["is_active"] is False
    assert on.data["data"]["is_active"] is True


def test_deleting_saved_settings_hands_the_provider_back_to_the_environment(admin_client, settings):
    settings.GA4_MEASUREMENT_ID = "G-ENV12345"
    settings.GA4_API_SECRET = "env-secret-value"
    _save_ga4(admin_client)

    response = admin_client.delete(f"{URL}ga4/")

    assert response.data["data"]["source"] == "environment"
    assert not ConversionProviderSetting.objects.exists()


# --- Delivery keeps working off the outbox -------------------------------------


def test_a_corrected_secret_applies_to_the_retry_without_a_second_event(admin_client):
    _save_ga4(admin_client)
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)
        record_purchase(order)
    admin_client.patch(f"{URL}ga4/", {"secret": "ga4CorrectedSecret_456"}, format="json")

    with patch(URLOPEN, side_effect=_ok) as urlopen:
        retry_conversion_events()
        retry_conversion_events()

    assert ConversionEvent.objects.filter(order=order).count() == 1
    assert urlopen.call_count == 1
    assert "ga4CorrectedSecret_456" in urlopen.call_args.args[0].full_url


def test_a_provider_failure_with_saved_settings_is_recorded_and_retried(admin_client):
    import urllib.error

    _save_ga4(admin_client)
    order = _checked_out()
    with transaction.atomic():
        record_purchase(order)

    with patch(URLOPEN, side_effect=urllib.error.URLError(TimeoutError())):
        retry_conversion_events()
    event = ConversionEvent.objects.get()
    assert (event.status, event.attempts) == ("failed", 1)
    assert GA4_SECRET not in event.last_error

    with patch(URLOPEN, side_effect=_ok):
        retry_conversion_events()
    event.refresh_from_db()
    assert event.status == "sent"


def test_settings_are_read_in_one_query_for_both_providers(admin_client):
    _save_ga4(admin_client)
    admin_client.patch(
        f"{URL}meta/", {"tracking_id": "1234567890", "secret": META_TOKEN}, format="json"
    )

    with CaptureQueriesContext(connection) as queries:
        credentials = load_credentials()

    assert len(queries) == 1
    assert {name for name, value in credentials.items() if value} == {"ga4", "meta"}
