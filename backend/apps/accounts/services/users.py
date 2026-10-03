from __future__ import annotations

from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError, transaction

from apps.accounts.constants import UserRole
from apps.accounts.models import User
from apps.accounts.selectors.users import get_active_user_by_email, is_last_active_admin
from apps.accounts.services.groups import sync_role_group
from apps.audit.services.audit import log_action
from apps.common.exceptions import BusinessRuleViolationError


def _ensure_admin_actor(actor: User) -> None:
    if not actor.is_superuser and actor.role != UserRole.ADMIN:
        raise BusinessRuleViolationError("Admin access is required.", code="admin_required")


@transaction.atomic
def create_user(
    *,
    email: str | None,
    password: str,
    role: str = UserRole.CUSTOMER,
    first_name: str = "",
    last_name: str = "",
    phone: str = "",
    profile_picture: str = "",
    is_active: bool = True,
) -> User:
    # email is None only for phone-only customers created at guest checkout.
    if email and get_active_user_by_email(email):
        raise BusinessRuleViolationError(
            "A user with this email already exists.",
            code="duplicate_email",
        )
    validate_password(password)
    user = User(
        email=email.lower() if email else None,
        username="",
        role=role,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        profile_picture=profile_picture,
        is_active=is_active,
    )
    user.set_password(password)
    try:
        # get_active_user_by_email above is a check, not a lock — a race can still hit this.
        with transaction.atomic():
            user.save()
    except IntegrityError as exc:
        raise BusinessRuleViolationError(
            "A user with this email already exists.",
            code="duplicate_email",
        ) from exc
    sync_role_group(user)
    return user


@transaction.atomic
def create_staff_user(*, permissions: list[str] | None = None, granted_by: User, **data) -> User:
    from apps.accounts.services.staff_permissions import set_staff_permissions

    _ensure_admin_actor(granted_by)
    user = create_user(role=UserRole.STAFF, **data)
    if permissions:
        set_staff_permissions(
            staff_user=user,
            permission_updates=[{"code": code, "is_enabled": True} for code in permissions],
            granted_by=granted_by,
        )
    return user


@transaction.atomic
def update_user_profile(user: User, data: dict) -> User:
    allowed_fields = {"first_name", "last_name", "phone", "profile_picture"}
    for field, value in data.items():
        if field in allowed_fields:
            setattr(user, field, value)
    user.save(update_fields=[field for field in data if field in allowed_fields])
    return user


def update_user_profile_image(*, user: User, profile_picture: str) -> User:
    return update_user_profile(user, {"profile_picture": profile_picture})


@transaction.atomic
def admin_update_user(*, actor: User, target_user: User, data: dict) -> User:
    _ensure_admin_actor(actor)
    allowed_fields = {
        "first_name",
        "last_name",
        "phone",
        "profile_picture",
        "is_active",
        "is_email_verified",
        "is_phone_verified",
    }
    for field, value in data.items():
        if field in allowed_fields:
            setattr(target_user, field, value)
    update_fields = [field for field in data if field in allowed_fields]
    if update_fields:
        target_user.save(update_fields=update_fields)
        log_action(
            actor=actor,
            action="user.updated",
            target_type="User",
            target_id=target_user.id,
            metadata={"fields": update_fields},
        )
    return target_user


def _ensure_can_disable(actor: User, target_user: User) -> None:
    if actor.id == target_user.id:
        raise BusinessRuleViolationError(
            "Admins cannot disable their own account.", code="self_disable"
        )
    if is_last_active_admin(target_user):
        raise BusinessRuleViolationError("Cannot disable the last active admin.", code="last_admin")


@transaction.atomic
def activate_user(*, actor: User, target_user: User) -> User:
    _ensure_admin_actor(actor)
    target_user.is_active = True
    target_user.save(update_fields=["is_active"])
    log_action(actor=actor, action="user.activated", target_type="User", target_id=target_user.id)
    return target_user


@transaction.atomic
def deactivate_user(*, actor: User, target_user: User) -> User:
    _ensure_admin_actor(actor)
    _ensure_can_disable(actor, target_user)
    target_user.is_active = False
    target_user.save(update_fields=["is_active"])
    log_action(actor=actor, action="user.deactivated", target_type="User", target_id=target_user.id)
    return target_user


@transaction.atomic
def soft_delete_user(*, actor: User, target_user: User) -> User:
    _ensure_admin_actor(actor)
    _ensure_can_disable(actor, target_user)
    target_user.soft_delete()
    log_action(
        actor=actor, action="user.soft_deleted", target_type="User", target_id=target_user.id
    )
    return target_user


@transaction.atomic
def restore_user(*, actor: User, target_user: User) -> User:
    _ensure_admin_actor(actor)
    target_user.restore()
    log_action(actor=actor, action="user.restored", target_type="User", target_id=target_user.id)
    return target_user


@transaction.atomic
def reset_user_password(*, actor: User, target_user: User, new_password: str) -> None:
    _ensure_admin_actor(actor)
    validate_password(new_password, user=target_user)
    target_user.set_password(new_password)
    target_user.save(update_fields=["password"])
    log_action(
        actor=actor,
        action="user.password_reset_by_admin",
        target_type="User",
        target_id=target_user.id,
    )


@transaction.atomic
def set_user_role(*, actor: User, target_user: User, role: str) -> User:
    _ensure_admin_actor(actor)
    if role not in UserRole.values:
        raise BusinessRuleViolationError("Invalid role.", code="invalid_role")
    if target_user.id == actor.id and role != UserRole.ADMIN and not actor.is_superuser:
        raise BusinessRuleViolationError(
            "Admins cannot remove their own admin role.",
            code="self_role_change",
        )
    if (
        is_last_active_admin(target_user)
        and role != UserRole.ADMIN
        and not target_user.is_superuser
    ):
        raise BusinessRuleViolationError("Cannot remove the last active admin.", code="last_admin")
    target_user.role = role
    target_user.save(update_fields=["role"])
    sync_role_group(target_user)
    log_action(
        actor=actor,
        action="user.role_changed",
        target_type="User",
        target_id=target_user.id,
        metadata={"role": role},
    )
    return target_user
