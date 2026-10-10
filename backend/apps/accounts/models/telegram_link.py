from __future__ import annotations

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class TelegramLink(TimeStampedModel):
    """A staff account bound to one Telegram account. Authorization is by the
    numeric Telegram user id, which never changes; a username or display name
    can be changed by its owner at any time."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="telegram_link"
    )
    telegram_user_id = models.BigIntegerField(unique=True)

    def __str__(self) -> str:
        return f"{self.user_id}:{self.telegram_user_id}"
