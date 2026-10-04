from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class Notification(TimeStampedModel):
    """An in-app message for one user, created by `notify` when something
    they care about changes (an order, a return)."""

    class Kind(models.TextChoices):
        ORDER = "order", "Order"
        RETURN = "return", "Return"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    kind = models.CharField(max_length=20, choices=Kind.choices)
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    # The order or return it is about, so the client can link straight to it.
    object_id = models.UUIDField(null=True, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering: ClassVar[list] = ["-created_at"]
        indexes: ClassVar[list] = [
            models.Index(fields=["user", "created_at"], name="notif_user_created_idx"),
            models.Index(fields=["user", "read_at"], name="notif_user_read_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}: {self.title}"
