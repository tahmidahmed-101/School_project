from __future__ import annotations

from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.accounts.constants import StaffPermissionCode
from apps.common.models import TimeStampedModel


class StaffPermission(TimeStampedModel):
    user: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_permissions",
    )
    permission_code: models.CharField = models.CharField(
        max_length=64, choices=StaffPermissionCode.choices
    )
    is_enabled: models.BooleanField = models.BooleanField(default=False)
    granted_by: models.ForeignKey = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="granted_staff_permissions",
    )
    granted_at: models.DateTimeField | None = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["user", "permission_code"],
                name="unique_staff_permission_code_per_user",
            )
        ]
        indexes: ClassVar[list] = [
            models.Index(fields=["permission_code"]),
            models.Index(fields=["is_enabled"]),
        ]

    def __str__(self) -> str:
        return f"{self.user.id}:{self.permission_code}"
