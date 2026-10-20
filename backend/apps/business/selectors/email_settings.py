"""Which outgoing mail server applies, and what staff may see about it.

Precedence:
1. An SMTP server saved from the dashboard sends mail while it is enabled and
   complete, with a password the server can decrypt.
2. Otherwise the environment's EMAIL_BACKEND / EMAIL_* settings apply exactly
   as before dashboard settings existed (the console backend unless set).

A disabled or unreadable saved server falls back rather than stopping email,
because email is how a customer recovers their account.
"""

from __future__ import annotations

from dataclasses import dataclass
from email.utils import formataddr

from django.conf import settings

from apps.business.models import SMTP_SINGLETON_ID, SmtpSetting
from apps.common.utils.secrets import (
    SecretUnavailableError,
    decrypt_secret,
    encryption_available,
)

SMTP_BACKEND = "django.core.mail.backends.smtp.EmailBackend"
SOURCE_DASHBOARD = "dashboard"
SOURCE_ENVIRONMENT = "environment"

PASSWORD_SET = "set"  # noqa: S105 - a status label, not a credential
PASSWORD_MISSING = "missing"  # noqa: S105 - a status label
# Saved, but no configured key decrypts it.
PASSWORD_UNREADABLE = "unreadable"  # noqa: S105 - a status label
PASSWORD_NOT_NEEDED = "not_needed"  # noqa: S105 - a status label


@dataclass(frozen=True)
class SmtpServer:
    host: str
    port: int
    security: str
    username: str
    password: str
    from_email: str


def saved_smtp_setting() -> SmtpSetting | None:
    return SmtpSetting.objects.filter(pk=SMTP_SINGLETON_ID).first()


def sender_address(row: SmtpSetting) -> str:
    return formataddr((row.from_name, row.from_email)) if row.from_name else row.from_email


def _password_status(row: SmtpSetting) -> str:
    if not row.username:
        return PASSWORD_NOT_NEEDED
    if not row.password_ciphertext:
        return PASSWORD_MISSING
    try:
        decrypt_secret(row.password_ciphertext)
    except SecretUnavailableError:
        return PASSWORD_UNREADABLE
    return PASSWORD_SET


def dashboard_server(row: SmtpSetting | None) -> SmtpServer | None:
    """The saved server if it is the one in force, else None (use the
    environment)."""
    if row is None or not row.is_enabled:
        return None
    password = ""
    if row.username:
        if not row.password_ciphertext:
            return None
        try:
            password = decrypt_secret(row.password_ciphertext)
        except SecretUnavailableError:
            return None
    return SmtpServer(
        host=row.host,
        port=row.port,
        security=row.security,
        username=row.username,
        password=password,
        from_email=sender_address(row),
    )


def environment_uses_smtp() -> bool:
    return settings.EMAIL_BACKEND == SMTP_BACKEND


def _environment_state() -> dict:
    backend = settings.EMAIL_BACKEND
    uses_smtp = backend == SMTP_BACKEND
    if settings.EMAIL_USE_SSL:
        security = SmtpSetting.Security.SSL
    elif settings.EMAIL_USE_TLS:
        security = SmtpSetting.Security.STARTTLS
    else:
        security = SmtpSetting.Security.NONE
    return {
        # The backend's last dotted part ("smtp", "console", "locmem", ...).
        "backend": backend.rsplit(".", 2)[-2] if "." in backend else backend,
        "sends_real_email": uses_smtp,
        "host": settings.EMAIL_HOST if uses_smtp else "",
        "port": settings.EMAIL_PORT if uses_smtp else None,
        "security": security if uses_smtp else "",
        "has_credentials": uses_smtp and bool(settings.EMAIL_HOST_USER),
        "from_email": settings.DEFAULT_FROM_EMAIL,
    }


def email_state(row: SmtpSetting | None = None, *, loaded: bool = False) -> dict:
    """Never carries the password: `password_status` only says whether one is
    saved and readable. Pass `loaded=True` with the row already in hand."""
    if not loaded:
        row = saved_smtp_setting()
    active = dashboard_server(row) is not None
    environment = _environment_state()
    state: dict = {
        "source": SOURCE_DASHBOARD if active else SOURCE_ENVIRONMENT,
        "sends_real_email": active or environment["sends_real_email"],
        "encryption_available": encryption_available(),
        "environment": environment,
        "dashboard": None,
    }
    if row is not None:
        state["dashboard"] = {
            "is_enabled": row.is_enabled,
            "is_active": active,
            "host": row.host,
            "port": row.port,
            "security": row.security,
            "username": row.username,
            "password_status": _password_status(row),
            "password_updated_at": row.password_updated_at,
            "from_name": row.from_name,
            "from_email": row.from_email,
            "last_test_at": row.last_test_at,
            "last_test_accepted": row.last_test_accepted,
            "last_test_reason": row.last_test_reason,
            "updated_at": row.updated_at,
            "updated_by_id": row.updated_by_id,
        }
    return state
