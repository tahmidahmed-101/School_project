"""Staff-managed SMTP settings and the dashboard's test email."""

from __future__ import annotations

import ipaddress
import re

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from apps.audit.services.audit import log_action
from apps.business.models import SMTP_SINGLETON_ID, SmtpSetting
from apps.business.selectors.business_profile import get_business_profile
from apps.business.selectors.email_settings import (
    SOURCE_DASHBOARD,
    dashboard_server,
    email_state,
    environment_uses_smtp,
    saved_smtp_setting,
)
from apps.business.services.email import (
    ALLOWED_SMTP_PORTS,
    EmailDeliveryError,
    is_public_address,
    send_email,
)
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.secrets import encrypt_secret

Security = SmtpSetting.Security

_HOSTNAME = re.compile(
    r"^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$"
)
_LINE_BREAK = re.compile(r"[\r\n]")
SETTING_FIELDS = ("host", "port", "security", "username", "from_name", "from_email")
# Changing where the password is sent, or whose it is, needs the password typed
# again: otherwise anyone who may edit settings could point the saved password
# at a server of their own and read it there.
_PASSWORD_BOUND_FIELDS = ("host", "username")


def _fail(message: str, code: str):
    raise BusinessRuleViolationError(message, code=code)


def _clean_host(value: str) -> str:
    host = value.strip().lower().rstrip(".")
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        # A dotted public name only: single-label names ("localhost", a Docker
        # service such as the database) are internal by definition.
        if not _HOSTNAME.match(host):
            _fail("Enter the mail server's host name, like smtp.example.com.", "invalid_host")
        return host
    if not is_public_address(str(address)):
        _fail("The mail server must be a public address.", "host_not_allowed")
    return host


def _clean(data: dict) -> dict:
    cleaned: dict = {}
    if "host" in data:
        cleaned["host"] = _clean_host(data["host"])
    if "port" in data:
        if data["port"] not in ALLOWED_SMTP_PORTS:
            ports = ", ".join(str(port) for port in ALLOWED_SMTP_PORTS)
            _fail(f"Use one of the mail ports: {ports}.", "invalid_port")
        cleaned["port"] = data["port"]
    if "security" in data:
        if data["security"] not in Security.values:
            _fail("Choose STARTTLS, SSL/TLS or none.", "invalid_security")
        cleaned["security"] = data["security"]
    if "username" in data:
        username = data["username"].strip()
        if _LINE_BREAK.search(username) or " " in username:
            _fail("The username cannot contain spaces or line breaks.", "invalid_username")
        cleaned["username"] = username
    if "password" in data:
        # Spaces are kept: some providers issue app passwords with them.
        if not data["password"] or _LINE_BREAK.search(data["password"]):
            _fail("Enter the SMTP password.", "invalid_password")
        cleaned["password"] = data["password"]
    if "from_email" in data:
        from_email = data["from_email"].strip()
        try:
            validate_email(from_email)
        except ValidationError:
            _fail("Enter a valid sender email address.", "invalid_from_email")
        cleaned["from_email"] = from_email
    if "from_name" in data:
        from_name = data["from_name"].strip()
        if _LINE_BREAK.search(from_name):
            _fail("The sender name cannot contain line breaks.", "invalid_from_name")
        cleaned["from_name"] = from_name
    if "is_enabled" in data:
        cleaned["is_enabled"] = bool(data["is_enabled"])
    return cleaned


def _ensure_complete(row: SmtpSetting, *, has_password: bool) -> None:
    for field in ("host", "port", "security", "from_email"):
        if not getattr(row, field):
            _fail("Host, port, security and sender email are all required.", "incomplete")
    if row.username and not has_password:
        _fail("Enter the password for this username.", "password_required")
    if row.username and row.security == Security.NONE:
        _fail(
            "A login is only sent over an encrypted connection: choose STARTTLS or SSL/TLS.",
            "login_requires_encryption",
        )


@transaction.atomic
def save_smtp_settings(*, data: dict, actor=None) -> dict:
    """Create or change the saved mail server. Omitted keys keep what is saved,
    so the password need not be re-entered to change the sender name. A row
    that would be incomplete or unsafe is never saved, enabled or not."""
    cleaned = _clean(data)
    existing = SmtpSetting.objects.select_for_update().filter(pk=SMTP_SINGLETON_ID).first()
    creating = existing is None
    row = existing if existing is not None else SmtpSetting(pk=SMTP_SINGLETON_ID)

    password_changes = "password" in cleaned
    if not creating and row.password_ciphertext and not password_changes:
        moved = [
            field
            for field in _PASSWORD_BOUND_FIELDS
            if field in cleaned and cleaned[field] != getattr(row, field)
        ]
        if moved and cleaned.get("username", row.username):
            _fail(
                "Enter the password again when changing the server or username.",
                "password_required",
            )

    changed: list[str] = []
    for field in (*SETTING_FIELDS, "is_enabled"):
        if field in cleaned and cleaned[field] != getattr(row, field):
            setattr(row, field, cleaned[field])
            changed.append(field)
    if "username" in changed and not row.username:
        # No login any more: drop the password that went with it.
        row.password_ciphertext = ""
        row.password_updated_at = None
    if password_changes and row.username:
        row.password_ciphertext = encrypt_secret(cleaned["password"])
        row.password_updated_at = timezone.now()
        changed.append("password")
    elif password_changes:
        _fail("A password needs a username.", "username_required")

    _ensure_complete(row, has_password=bool(row.password_ciphertext))
    if not (creating or changed):
        return email_state(row, loaded=True)
    if set(changed) - {"is_enabled", "from_name"}:
        # A different server or login: the last test no longer says anything.
        row.last_test_at = None
        row.last_test_accepted = None
        row.last_test_reason = ""
    row.updated_by = actor if getattr(actor, "pk", None) else None
    row.save()
    log_action(
        actor=actor,
        action="email_settings.updated",
        target_type="SmtpSetting",
        target_id=row.pk,
        # Field names only: no value, least of all the password, is recorded.
        metadata={"changed": changed, "is_enabled": row.is_enabled},
    )
    return email_state(row, loaded=True)


@transaction.atomic
def reset_smtp_settings(*, actor=None) -> dict:
    """Forget the saved server; the environment's settings apply again."""
    deleted, _ = SmtpSetting.objects.filter(pk=SMTP_SINGLETON_ID).delete()
    if deleted:
        log_action(actor=actor, action="email_settings.reset", target_type="SmtpSetting")
    return email_state(None, loaded=True)


def _record_test(row: SmtpSetting | None, *, accepted: bool, reason: str) -> None:
    if row is None:
        return
    SmtpSetting.objects.filter(pk=row.pk).update(
        last_test_at=timezone.now(), last_test_accepted=accepted, last_test_reason=reason
    )


def send_test_email(*, recipient: str, actor=None) -> dict:
    """Send a clearly marked test message through the server in force. Runs
    outside any transaction, so no lock is held while the server answers.
    The result says only whether the SMTP server accepted it."""
    recipient = recipient.strip()
    try:
        validate_email(recipient)
    except ValidationError:
        _fail("Enter a valid recipient email address.", "invalid_recipient")
    if _LINE_BREAK.search(recipient):
        _fail("Enter a valid recipient email address.", "invalid_recipient")

    row = saved_smtp_setting()
    server = dashboard_server(row)
    if server is None and not environment_uses_smtp():
        _fail(
            "No SMTP server is active: save and enable one, or configure SMTP on the server.",
            "smtp_not_configured",
        )
    shop = get_business_profile().name
    body = (
        f"This is a test message from {shop}, sent to check the outgoing email settings.\n\n"
        "If you are reading it, the mail server accepted the message and it reached this "
        "inbox. No action is needed."
    )
    accepted, reason = True, ""
    try:
        source = send_email(
            subject=f"[Test] Email settings check - {shop}",
            body=body,
            to=[recipient],
            purpose="test",
            server=server,
        )
    except EmailDeliveryError as exc:
        accepted, reason = False, exc.reason
        source = SOURCE_DASHBOARD if server is not None else "environment"
    _record_test(row if server is not None else None, accepted=accepted, reason=reason)
    log_action(
        actor=actor,
        action="email_settings.test_sent",
        target_type="SmtpSetting",
        target_id=row.pk if row is not None else "",
        metadata={"source": source, "accepted": accepted, "reason": reason},
    )
    return {"accepted": accepted, "reason": reason, "source": source, "recipient": recipient}
