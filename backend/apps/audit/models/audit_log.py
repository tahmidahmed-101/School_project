from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel


class AuditLog(TimeStampedModel):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="audit_logs",
    )
    action = models.CharField(max_length=100)
    target_type = models.CharField(max_length=100, blank=True)
    target_id = models.CharField(max_length=64, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes: ClassVar[list] = [
            models.Index(fields=["actor", "created_at"]),
            models.Index(fields=["action"]),
            models.Index(fields=["target_type", "target_id"]),
        ]
        ordering: ClassVar[list] = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} by {self.actor_id or 'system'} at {self.created_at:%Y-%m-%d %H:%M}"
