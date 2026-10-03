from __future__ import annotations

from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import StaffPermission, User
from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError


def set_staff_permission(
    *,
    staff_user: User,
    permission_code: str,
    is_enabled: bool,
    granted_by: User | None = None,
) -> StaffPermission:
    if staff_user.role != UserRole.STAFF:
        raise BusinessRuleViolationError("Permissions can only be assigned to staff users.")

    permission, _ = StaffPermission.objects.update_or_create(
        user=staff_user,
        permission_code=permission_code,
        defaults={
            "is_enabled": is_enabled,
            "granted_by": granted_by,
            "granted_at": timezone.now() if is_enabled else None,
        },
    )
    return permission


def set_staff_permissions(
    *,
    staff_user: User,
    permission_updates: list[dict],
    granted_by: User | None = None,
) -> list[StaffPermission]:
    permissions: list[StaffPermission] = []
    valid_codes = set(StaffPermissionCode.values)
    for update in permission_updates:
        code = update.get("code")
        if code not in valid_codes:
            raise BusinessRuleViolationError(
                "Invalid staff permission code.", code="invalid_permission"
            )
        permissions.append(
            set_staff_permission(
                staff_user=staff_user,
                permission_code=code,
                is_enabled=bool(update.get("is_enabled", True)),
                granted_by=granted_by,
            )
        )
    log_action(
        actor=granted_by,
        action="staff_permissions.updated",
        target_type="User",
        target_id=staff_user.id,
        metadata={"updates": permission_updates},
    )
    return permissions


def replace_staff_permissions(
    *,
    staff_user: User,
    permission_codes: list[str],
    granted_by: User | None = None,
) -> list[StaffPermission]:
    if staff_user.role != UserRole.STAFF:
        raise BusinessRuleViolationError("Permissions can only be assigned to staff users.")

    valid_codes = set(StaffPermissionCode.values)
    requested = set(permission_codes)
    invalid = requested - valid_codes
    if invalid:
        raise BusinessRuleViolationError(
            "Invalid staff permission code.", code="invalid_permission"
        )

    current = set(
        staff_user.staff_permissions.filter(is_enabled=True).values_list(
            "permission_code", flat=True
        )
    )
    updates: list[tuple[str, bool]] = [(code, True) for code in requested - current] + [
        (code, False) for code in current - requested
    ]

    permissions = [
        set_staff_permission(
            staff_user=staff_user,
            permission_code=code,
            is_enabled=is_enabled,
            granted_by=granted_by,
        )
        for code, is_enabled in updates
    ]
    if updates:
        log_action(
            actor=granted_by,
            action="staff_permissions.updated",
            target_type="User",
            target_id=staff_user.id,
            metadata={
                "updates": [
                    {"code": code, "is_enabled": is_enabled} for code, is_enabled in updates
                ]
            },
        )
    return permissions
