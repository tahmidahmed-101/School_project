from __future__ import annotations

import json
import logging
import smtplib
import socket
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pytest
from cryptography.fernet import Fernet
from django.core import mail
from django.core.cache import cache

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.authentication import (
    request_email_verification,
    request_password_reset,
)
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user
from apps.audit.models import AuditLog
from apps.business.models import SmtpSetting
from apps.common.utils.secrets import decrypt_secret

pytestmark = pytest.mark.django_db

URL = "/api/v1/admin/settings/email/"
TEST_URL = f"{URL}test/"
PASSWORD = "smtp-pass word-123"
SERVER_REPLY = b"5.7.8 Username and Password not accepted for mailer@example.com"
PUBLIC_IP = "93.184.216.34"
KEY = Fernet.generate_key().decode()
SMTP_CLASS = "django.core.mail.backends.smtp.smtplib.SMTP"
SMTP_SSL_CLASS = "django.core.mail.backends.smtp.smtplib.SMTP_SSL"
RESOLVER = "apps.business.services.email.socket.getaddrinfo"

COMPLETE = {
    "host": "smtp.example.com",
    "port": 587,
    "security": "starttls",
    "username": "mailer@example.com",
    "password": PASSWORD,
    "from_name": "School Project",
    "from_email": "orders@example.com",
}


@pytest.fixture(autouse=True)
def _setup(settings):
    settings.SECRETS_ENCRYPTION_KEYS = [KEY]
    cache.clear()


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(user=create_user(email="owner@example.com", role=UserRole.ADMIN))
    return api_client


def _staff_client(api_client, *codes):
    staff = create_user(email=f"staff{len(codes)}@example.com", role=UserRole.STAFF)
    for code in codes:
        set_staff_permission(staff_user=staff, permission_code=code, is_enabled=True)
    api_client.force_authenticate(user=staff)
    return api_client


def _resolves_to(address):
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, 587))]


@contextmanager
def smtp_server(*, resolves_to=PUBLIC_IP, login_error=None, connect_error=None):
    """A mocked SMTP server reached through Django's own SMTP backend."""
    connection = MagicMock()
    connection.sendmail.return_value = {}
    if login_error is not None:
        connection.login.side_effect = login_error
    smtp_class = MagicMock(return_value=connection, side_effect=connect_error)
    if connect_error is None:
        smtp_class.side_effect = None
    with (
        patch(RESOLVER, return_value=_resolves_to(resolves_to)),
        patch(SMTP_CLASS, smtp_class),
        patch(SMTP_SSL_CLASS, smtp_class),
    ):
        yield smtp_class, connection


def _save(client, **overrides):
    return client.patch(URL, {**COMPLETE, **overrides}, format="json")


# --- Permissions ------------------------------------------------------------


def test_only_settings_staff_reach_the_email_settings(api_client):
    assert api_client.get(URL).status_code in (401, 403)
    api_client.force_authenticate(user=create_user(email="shopper@example.com"))
    assert api_client.get(URL).status_code == 403

    client = _staff_client(api_client)
    assert client.get(URL).status_code == 403


def test_settings_view_reads_but_only_settings_manage_writes_or_tests(api_client):
    client = _staff_client(api_client, StaffPermissionCode.SETTINGS_VIEW)
    assert client.get(URL).status_code == 200
    assert _save(client).status_code == 403
    assert client.delete(URL).status_code == 403
    assert client.post(TEST_URL, {}, format="json").status_code == 403

    client = _staff_client(api_client, StaffPermissionCode.SETTINGS_MANAGE)
    assert _save(client).status_code == 200


# --- Saving, masking, encryption -------------------------------------------------


def test_a_saved_server_is_active_and_its_password_is_never_returned(admin_client):
    saved = _save(admin_client)
    listing = admin_client.get(URL)

    assert saved.status_code == 200
    for body in (saved.content, listing.content):
        assert PASSWORD.encode() not in body
    data = listing.data["data"]
    assert (data["source"], data["sends_real_email"]) == ("dashboard", True)
    assert data["dashboard"]["password_status"] == "set"
    assert data["dashboard"]["host"] == "smtp.example.com"


def test_the_password_is_encrypted_at_rest_and_kept_out_of_the_audit_log(admin_client):
    _save(admin_client)

    row = SmtpSetting.objects.get()
    assert PASSWORD not in row.password_ciphertext
    assert decrypt_secret(row.password_ciphertext) == PASSWORD
    assert PASSWORD not in json.dumps(list(AuditLog.objects.values_list("metadata", flat=True)))


def test_other_fields_change_without_sending_the_password_again(admin_client):
    _save(admin_client)
    ciphertext = SmtpSetting.objects.get().password_ciphertext

    response = admin_client.patch(URL, {"from_name": "School Project Orders"}, format="json")

    assert response.status_code == 200
    row = SmtpSetting.objects.get()
    assert (row.from_name, row.password_ciphertext) == ("School Project Orders", ciphertext)


@pytest.mark.parametrize("field", ["host", "username"])
def test_moving_the_password_to_another_server_or_login_needs_it_again(admin_client, field):
    _save(admin_client)
    new_value = {"host": "smtp.other-provider.com", "username": "someone@example.com"}[field]

    refused = admin_client.patch(URL, {field: new_value}, format="json")
    allowed = admin_client.patch(URL, {field: new_value, "password": PASSWORD}, format="json")

    assert refused.status_code == 400
    assert refused.data["error"]["code"] == "password_required"
    assert allowed.status_code == 200


def test_secrets_cannot_be_saved_without_an_encryption_key(admin_client, settings):
    settings.SECRETS_ENCRYPTION_KEYS = []

    response = _save(admin_client)

    assert response.data["error"]["code"] == "encryption_key_missing"
    assert not SmtpSetting.objects.exists()


def test_a_relay_without_a_login_needs_no_password_or_key(admin_client, settings):
    settings.SECRETS_ENCRYPTION_KEYS = []

    response = admin_client.patch(
        URL,
        {
            "host": "relay.example.com",
            "port": 25,
            "security": "none",
            "from_email": "a@example.com",
        },
        format="json",
    )

    assert response.status_code == 200
    assert response.data["data"]["dashboard"]["password_status"] == "not_needed"


# --- Validation -------------------------------------------------------------


@pytest.mark.parametrize(
    ("overrides", "code"),
    [
        ({"host": "localhost"}, "invalid_host"),
        ({"host": "school-project-db"}, "invalid_host"),
        ({"host": "https://smtp.example.com"}, "invalid_host"),
        ({"host": "10.0.0.5"}, "host_not_allowed"),
        ({"host": "127.0.0.1"}, "host_not_allowed"),
        ({"port": 22}, "invalid_port"),
        ({"port": 5432}, "invalid_port"),
        ({"security": "none"}, "login_requires_encryption"),
        ({"from_email": "not-an-email"}, "invalid_from_email"),
        ({"from_name": "Shop\r\nBcc: victim@example.com"}, "invalid_from_name"),
        ({"password": "line\nbreak"}, "invalid_password"),
    ],
)
def test_invalid_settings_are_refused_and_nothing_is_saved(admin_client, overrides, code):
    response = _save(admin_client, **overrides)

    assert response.status_code == 400
    assert response.data["error"]["code"] == code
    assert not SmtpSetting.objects.exists()


def test_a_login_without_a_password_is_refused(admin_client):
    payload = {key: value for key, value in COMPLETE.items() if key != "password"}

    response = admin_client.patch(URL, payload, format="json")

    assert response.data["error"]["code"] == "password_required"


def test_a_password_without_a_login_is_refused(admin_client):
    response = _save(admin_client, username="")

    assert response.data["error"]["code"] == "username_required"


def test_an_incomplete_first_save_is_refused(admin_client):
    response = admin_client.patch(URL, {"from_email": "a@example.com"}, format="json")

    assert response.data["error"]["code"] == "incomplete"


def test_an_empty_update_is_refused(admin_client):
    assert admin_client.patch(URL, {}, format="json").status_code == 400


# --- Precedence and fallback -------------------------------------------------


def test_with_nothing_saved_the_environment_settings_apply(admin_client, settings):
    settings.EMAIL_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
    settings.EMAIL_HOST = "smtp.env-provider.com"
    settings.EMAIL_HOST_USER = "env-user"
    settings.EMAIL_HOST_PASSWORD = "env-password-value"

    response = admin_client.get(URL)

    data = response.data["data"]
    assert (data["source"], data["dashboard"]) == ("environment", None)
    assert data["environment"]["host"] == "smtp.env-provider.com"
    assert data["environment"]["has_credentials"] is True
    assert b"env-password-value" not in response.content


def test_a_saved_server_takes_precedence_over_the_environment():
    from apps.business.services.email import send_email

    create_saved_server()
    with smtp_server() as (smtp_class, connection):
        source = send_email(subject="Hi", body="Body", to=["a@example.com"], purpose="test")

    assert source == "dashboard"
    smtp_class.assert_called_once()
    assert smtp_class.call_args.args[:2] == ("smtp.example.com", 587)
    connection.starttls.assert_called_once()
    connection.login.assert_called_once_with("mailer@example.com", PASSWORD)
    assert mail.outbox == []


def test_a_disabled_saved_server_hands_mail_back_to_the_environment(admin_client):
    _save(admin_client)

    response = admin_client.patch(URL, {"is_enabled": False}, format="json")
    with patch(SMTP_CLASS) as smtp_class:
        request_password_reset("owner@example.com")

    assert response.data["data"]["source"] == "environment"
    smtp_class.assert_not_called()
    assert len(mail.outbox) == 1


def test_an_unreadable_saved_password_falls_back_to_the_environment(admin_client, settings):
    _save(admin_client)
    settings.SECRETS_ENCRYPTION_KEYS = [Fernet.generate_key().decode()]

    data = admin_client.get(URL).data["data"]
    with patch(SMTP_CLASS) as smtp_class:
        request_password_reset("owner@example.com")

    assert data["source"] == "environment"
    assert data["dashboard"]["password_status"] == "unreadable"
    smtp_class.assert_not_called()
    assert len(mail.outbox) == 1


def test_deleting_the_saved_server_returns_to_the_environment(admin_client):
    _save(admin_client)

    response = admin_client.delete(URL)

    assert response.data["data"]["source"] == "environment"
    assert not SmtpSetting.objects.exists()


# --- Test email ---------------------------------------------------------------


def create_saved_server(**overrides):
    from apps.business.services.email_settings import save_smtp_settings

    save_smtp_settings(data={**COMPLETE, **overrides})


def test_a_test_email_reports_that_the_server_accepted_it(admin_client):
    create_saved_server()

    with smtp_server() as (_smtp_class, connection):
        response = admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert response.status_code == 200
    assert response.data["data"] == {
        "accepted": True,
        "reason": "",
        "source": "dashboard",
        "recipient": "check@example.com",
    }
    assert "does not confirm" in response.data["message"]
    _sender, recipients, message = connection.sendmail.call_args.args
    assert recipients == ["check@example.com"]
    assert b"[Test] Email settings check" in message
    row = SmtpSetting.objects.get()
    assert (row.last_test_accepted, row.last_test_reason) == (True, "")


def test_a_rejected_login_is_reported_without_the_server_reply_or_password(admin_client, caplog):
    create_saved_server()
    error = smtplib.SMTPAuthenticationError(535, SERVER_REPLY)

    with caplog.at_level(logging.DEBUG), smtp_server(login_error=error):
        response = admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert response.data["data"]["accepted"] is False
    assert response.data["data"]["reason"] == "auth_failed"
    for text in (response.content.decode(), caplog.text):
        assert PASSWORD not in text
        assert SERVER_REPLY.decode() not in text
    assert SmtpSetting.objects.get().last_test_reason == "auth_failed"


@pytest.mark.parametrize(
    ("connect_error", "reason"),
    [
        (TimeoutError(), "timeout"),
        (ConnectionRefusedError(), "connection_failed"),
        (smtplib.SMTPServerDisconnected(), "connection_failed"),
    ],
)
def test_unreachable_servers_are_reported_safely(admin_client, connect_error, reason):
    create_saved_server()

    with smtp_server(connect_error=connect_error):
        response = admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert response.data["data"]["reason"] == reason


def test_a_server_name_that_resolves_inside_the_network_is_never_contacted(admin_client):
    create_saved_server()

    with smtp_server(resolves_to="172.18.0.4") as (smtp_class, _connection):
        response = admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert response.data["data"]["reason"] == "host_not_allowed"
    smtp_class.assert_not_called()


def test_the_connection_uses_the_configured_timeout(admin_client, settings):
    settings.EMAIL_TIMEOUT = 7
    create_saved_server(port=465, security="ssl")

    with smtp_server() as (smtp_class, _connection):
        admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert smtp_class.call_args.kwargs["timeout"] == 7


def test_a_test_email_needs_an_active_smtp_server(admin_client):
    response = admin_client.post(TEST_URL, {"recipient": "check@example.com"}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "smtp_not_configured"


def test_a_test_email_needs_a_valid_recipient(admin_client):
    create_saved_server()

    response = admin_client.post(TEST_URL, {"recipient": "nobody"}, format="json")

    assert response.data["error"]["code"] == "invalid_recipient"


def test_test_emails_are_rate_limited(admin_client, settings):
    # Tests run with throttling off; switch this one scope back on.
    settings.REST_FRAMEWORK = {
        **settings.REST_FRAMEWORK,
        "DEFAULT_THROTTLE_RATES": {
            **settings.REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"],
            "email_test": "5/hour",
        },
    }
    create_saved_server()

    with smtp_server():
        statuses = [
            admin_client.post(
                TEST_URL, {"recipient": "check@example.com"}, format="json"
            ).status_code
            for _ in range(6)
        ]

    assert statuses == [200] * 5 + [429]


# --- Existing email flows ------------------------------------------------------


def test_password_reset_goes_through_the_saved_server_unchanged():
    create_user(email="customer@example.com")
    create_saved_server()

    with smtp_server() as (_smtp_class, connection):
        request_password_reset("customer@example.com")

    _sender, recipients, message = connection.sendmail.call_args.args
    assert recipients == ["customer@example.com"]
    assert b"Subject: Reset your password" in message
    assert b"Your password reset code is" in message


def test_a_failing_server_never_changes_the_password_reset_response(api_client, caplog):
    create_user(email="customer@example.com")
    create_saved_server()

    with caplog.at_level(logging.WARNING), smtp_server(connect_error=ConnectionRefusedError()):
        known = api_client.post(
            "/api/v1/customer/auth/forgot-password/", {"email": "customer@example.com"}
        )
        unknown = api_client.post(
            "/api/v1/customer/auth/forgot-password/", {"email": "nobody@example.com"}
        )

    assert known.status_code == unknown.status_code == 200
    assert known.data == unknown.data
    assert "password_reset" in caplog.text
    assert PASSWORD not in caplog.text


def test_email_verification_reports_a_failing_server_as_unavailable(api_client):
    user = create_user(email="verify@example.com")
    create_saved_server()
    api_client.force_authenticate(user=user)

    with smtp_server(connect_error=ConnectionRefusedError()):
        response = api_client.post("/api/v1/customer/auth/request-email-verification/")

    assert response.status_code == 503
    assert response.data["error"]["code"] == "email_unavailable"


def test_email_verification_still_uses_the_environment_backend_by_default():
    user = create_user(email="verify@example.com")

    request_email_verification(user)

    assert mail.outbox[0].subject == "Verify your email"
    assert mail.outbox[0].from_email == "noreply@example.com"


def test_confirming_an_order_sends_no_email_even_with_a_server_saved(
    django_capture_on_commit_callbacks,
):
    from apps.accounting.tests.helpers import seed_chart_of_accounts
    from apps.marketing.tests.test_conversions import _checked_out
    from apps.orders.constants import PaymentMethodKey
    from apps.orders.models import SalesOrder
    from apps.orders.services.payments import record_payment_due

    seed_chart_of_accounts()
    create_saved_server()
    order = _checked_out()

    with (
        smtp_server() as (smtp_class, _connection),
        django_capture_on_commit_callbacks(execute=True),
    ):
        record_payment_due(order=order, method=PaymentMethodKey.COD)

    order.refresh_from_db()
    assert order.status == SalesOrder.Status.CONFIRMED
    smtp_class.assert_not_called()
    assert mail.outbox == []
