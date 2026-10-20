from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

SMTP_SINGLETON_ID = uuid.UUID("00000000-0000-0000-0000-00000000e3a1")


class SmtpSetting(TimeStampedModel):
    """The shop's own outgoing mail server, saved from the dashboard.

    One row at most (`SMTP_SINGLETON_ID`). While it is enabled and complete it
    sends every transactional email; disabled, missing, or with a password the
    server can no longer decrypt, the environment's EMAIL_* settings apply
    instead, so a broken custom server never stops password resets.
    """

    class Security(models.TextChoices):
        STARTTLS = "starttls", "STARTTLS (usually port 587)"
        SSL = "ssl", "SSL/TLS (usually port 465)"
        NONE = "none", "None (no encryption, no login)"

    host = models.CharField(max_length=253)
    port = models.PositiveIntegerField()
    security = models.CharField(max_length=10, choices=Security.choices)
    username = models.CharField(max_length=254, blank=True)
    # Fernet-encrypted (apps.common.utils.secrets). Never serialized.
    password_ciphertext = models.TextField(blank=True)
    password_updated_at = models.DateTimeField(null=True, blank=True)
    from_name = models.CharField(max_length=100, blank=True)
    from_email = models.EmailField()
    is_enabled = models.BooleanField(default=True)
    # The outcome of the last dashboard test email: whether the SMTP server
    # accepted it, never whether it reached an inbox.
    last_test_at = models.DateTimeField(null=True, blank=True)
    last_test_accepted = models.BooleanField(null=True, blank=True)
    last_test_reason = models.CharField(max_length=40, blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    def __str__(self) -> str:
        return f"{self.host}:{self.port} ({'on' if self.is_enabled else 'off'})"
