from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class UserOTP(TimeStampedModel):
    # A 6-digit code has a million possibilities, which sounds like a lot until
    # you can guess against it without limit: the endpoints that consume OTPs
    # are authenticated, so the per-user rate limit alone allows thousands of
    # tries inside a single code's 10-minute life. Locking the code after a
    # handful of wrong guesses caps that at a negligible probability, and the
    # user simply requests a new one.
    MAX_ATTEMPTS = 5

    class Purpose(models.TextChoices):
        EMAIL_VERIFICATION = "email_verification", "Email verification"
        PASSWORD_RESET = "password_reset", "Password reset"
        PHONE_VERIFICATION = "phone_verification", "Phone verification"
        PHONE_CHANGE = "phone_change", "Phone change"
        TELEGRAM_LINK = "telegram_link", "Telegram link"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="otps",
    )
    purpose = models.CharField(max_length=32, choices=Purpose.choices)
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveIntegerField(default=0)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "purpose", "expires_at"]),
            models.Index(fields=["consumed_at"]),
        ]

    @property
    def is_consumed(self) -> bool:
        return self.consumed_at is not None

    @property
    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    @property
    def is_locked(self) -> bool:
        return self.attempts >= self.MAX_ATTEMPTS

    @property
    def is_usable(self) -> bool:
        return not (self.is_consumed or self.is_expired or self.is_locked)

    def record_failed_attempt(self) -> None:
        self.attempts += 1
        self.save(update_fields=["attempts", "updated_at"])

    def consume(self) -> None:
        self.consumed_at = timezone.now()
        self.save(update_fields=["consumed_at", "updated_at"])
