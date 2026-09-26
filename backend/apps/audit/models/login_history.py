from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class LoginHistory(TimeStampedModel):
    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="login_history",
    )
    email: models.CharField = models.CharField(max_length=254, blank=True)
    ip_address: models.GenericIPAddressField = models.GenericIPAddressField(null=True, blank=True)
    user_agent: models.CharField = models.CharField(max_length=500, blank=True)
    was_successful: models.BooleanField = models.BooleanField(default=False)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "created_at"]),
            models.Index(fields=["email"]),
        ]
        ordering: ClassVar[list] = ["-created_at"]

    def __str__(self) -> str:
        outcome = "success" if self.was_successful else "failure"
        return f"{self.email or self.user_id} login {outcome} at {self.created_at:%Y-%m-%d %H:%M}"
