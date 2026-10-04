from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from django.db import models

# Django 6 assumes https for a scheme-less URL typed into a form; opting in
# now silences RemovedInDjango60Warning and matches the admin API, which
# already assumes https (AdminBusinessProfileUpdateSerializer).
HTTPS_URL_FORMFIELD_OVERRIDES: Mapping[type[models.Field], Mapping[str, Any]] = {
    models.URLField: {"assume_scheme": "https"}
}


class StaffPermissionAdminMixin:
    """Gate a ModelAdmin with a StaffPermissionCode instead of Django's
    built-in permission table. Superusers and role=admin always pass."""

    view_permission_code: str | None = None
    manage_permission_code: str | None = None

    def _has_code(self, request, code: str | None) -> bool:
        user = request.user
        if not user.is_authenticated:
            return False
        if user.is_superuser or user.role == "admin":
            return True
        if user.role != "staff" or not code:
            return False
        return user.staff_permissions.filter(permission_code=code, is_enabled=True).exists()

    def has_view_permission(self, request, obj=None) -> bool:
        return self._has_code(request, self.view_permission_code) or self._has_code(
            request, self.manage_permission_code
        )

    def has_add_permission(self, request) -> bool:
        return self._has_code(request, self.manage_permission_code)

    def has_change_permission(self, request, obj=None) -> bool:
        return self._has_code(request, self.manage_permission_code)

    def has_delete_permission(self, request, obj=None) -> bool:
        return self._has_code(request, self.manage_permission_code)
