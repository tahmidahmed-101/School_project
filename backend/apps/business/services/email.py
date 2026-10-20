"""Outgoing email transport. Callers compose the message; this picks the mail
server (`selectors.email_settings` has the precedence rule) and sends it.

Each send gets its own connection object: the global EMAIL_* settings are
never changed at runtime, so concurrent requests and workers cannot see each
other's configuration.

"Accepted" here always means the SMTP server took the message. Whether it then
reached an inbox is not something SMTP can tell us.
"""

from __future__ import annotations

import ipaddress
import logging
import smtplib
import socket
import ssl

from django.conf import settings
from django.core.mail import EmailMessage, get_connection

from apps.business.models import SmtpSetting
from apps.business.selectors.email_settings import (
    SMTP_BACKEND,
    SOURCE_DASHBOARD,
    SOURCE_ENVIRONMENT,
    SmtpServer,
    dashboard_server,
    saved_smtp_setting,
)
from apps.common.exceptions import DomainError

logger = logging.getLogger("apps")

# Ports a mail-submission or relay server listens on. Anything else is refused
# so a saved "SMTP server" cannot be used to probe other services.
ALLOWED_SMTP_PORTS = (25, 465, 587, 2525)


class EmailDeliveryError(DomainError):
    """The mail server did not take the message. `reason` is a fixed code,
    safe to show staff and to log; the server's own reply never is, since it
    can echo the login."""

    default_code = "email_unavailable"

    def __init__(self, reason: str) -> None:
        super().__init__(
            "The email could not be sent right now. Please try again later.",
            code=self.default_code,
        )
        self.reason = reason


def failure_reason(exc: BaseException) -> str:
    if isinstance(exc, EmailDeliveryError):
        return exc.reason
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "auth_failed"
    if isinstance(exc, smtplib.SMTPRecipientsRefused):
        return "recipient_refused"
    if isinstance(exc, smtplib.SMTPSenderRefused):
        return "sender_refused"
    if isinstance(exc, smtplib.SMTPNotSupportedError | ssl.SSLError):
        return "tls_failed"
    if isinstance(exc, smtplib.SMTPServerDisconnected | smtplib.SMTPConnectError):
        return "connection_failed"
    if isinstance(exc, smtplib.SMTPException):
        return "rejected"
    if isinstance(exc, TimeoutError | socket.timeout):
        return "timeout"
    if isinstance(exc, OSError):
        return "connection_failed"
    return "unexpected_error"


def is_public_address(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False


def ensure_public_host(host: str, port: int) -> None:
    """Refuse a saved server that resolves to a loopback, private, link-local
    or otherwise internal address, so it cannot reach this network's own
    services. Checked on every connection, since DNS can change."""
    try:
        resolved = {info[4][0] for info in socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)}
    except (OSError, UnicodeError):
        raise EmailDeliveryError("connection_failed") from None
    if not resolved or not all(is_public_address(str(address)) for address in resolved):
        raise EmailDeliveryError("host_not_allowed")


def _dashboard_connection(server: SmtpServer):
    ensure_public_host(server.host, server.port)
    return get_connection(
        SMTP_BACKEND,
        host=server.host,
        port=server.port,
        username=server.username or None,
        password=server.password or None,
        use_tls=server.security == SmtpSetting.Security.STARTTLS,
        use_ssl=server.security == SmtpSetting.Security.SSL,
        timeout=settings.EMAIL_TIMEOUT,
        fail_silently=False,
    )


def open_transport(server: SmtpServer | None = None) -> tuple[object, str, str]:
    """(connection, from address, source) for the server in force, or for
    `server` when given. One query for the saved settings."""
    if server is None:
        server = dashboard_server(saved_smtp_setting())
    if server is not None:
        return _dashboard_connection(server), server.from_email, SOURCE_DASHBOARD
    return get_connection(fail_silently=False), settings.DEFAULT_FROM_EMAIL, SOURCE_ENVIRONMENT


def send_email(*, subject: str, body: str, to: list[str], purpose: str, server=None) -> str:
    """Send one plain-text message. Returns the source that took it. Raises
    `EmailDeliveryError` (a 503 `email_unavailable` if left uncaught) when the
    server refuses it or cannot be reached; never another exception type."""
    try:
        connection, from_email, source = open_transport(server)
        EmailMessage(subject, body, from_email, to, connection=connection).send()
    except Exception as exc:
        reason = failure_reason(exc)
        # Purpose and reason only: no address, no server reply, no credential.
        logger.warning("Email (%s) was not accepted: %s", purpose, reason)
        if reason == "unexpected_error":
            logger.error("Unexpected %s while sending email (%s)", type(exc).__name__, purpose)
        raise EmailDeliveryError(reason) from None
    return source
