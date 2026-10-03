from __future__ import annotations

from uuid import UUID

from django.db.models import Prefetch, Q, QuerySet
from django.utils import timezone

from apps.accounts.constants import UserRole
from apps.accounts.models import Address, StaffPermission, User, UserOTP


def active_users() -> QuerySet[User]:
    return User.objects.filter(is_active=True, deleted_at__isnull=True)


def _enabled_staff_permissions_prefetch() -> Prefetch:
    return Prefetch(
        "staff_permissions",
        queryset=StaffPermission.objects.filter(is_enabled=True),
        to_attr="_prefetched_enabled_staff_permissions",
    )


def _contact_address_prefetch() -> Prefetch:
    """Guest checkouts leave `User.first_name`/`phone` blank — the real name and
    phone only ever land on the address."""
    return Prefetch(
        "addresses",
        queryset=Address.objects.filter(deleted_at__isnull=True).order_by(
            "-is_default", "created_at"
        ),
        to_attr="_prefetched_contact_addresses",
    )


def user_contact_address(user: User):
    cached = getattr(user, "_prefetched_contact_addresses", None)
    if cached is not None:
        return cached[0] if cached else None
    return (
        user.addresses.filter(deleted_at__isnull=True).order_by("-is_default", "created_at").first()
    )


def user_display_name(user: User) -> str:
    address = user_contact_address(user)
    if address and address.full_name.strip():
        return address.full_name.strip()
    full = f"{user.first_name} {user.last_name}".strip()
    if full:
        return full
    # Phone-only customers (guest checkout without an email) have no email.
    return user.email.split("@")[0] if user.email else user_contact_phone(user)


def user_contact_phone(user: User) -> str:
    if user.phone:
        return user.phone
    address = user_contact_address(user)
    return address.phone if address else ""


def users_list(
    *,
    role: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    include_deleted: bool = False,
) -> QuerySet[User]:
    queryset = User.objects.prefetch_related(
        _enabled_staff_permissions_prefetch(), _contact_address_prefetch()
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    if role:
        queryset = queryset.filter(role=role)
    if is_active is not None:
        queryset = queryset.filter(is_active=is_active)
    if search:
        queryset = queryset.filter(
            Q(email__icontains=search)
            | Q(first_name__icontains=search)
            | Q(last_name__icontains=search)
            | Q(phone__icontains=search)
            | Q(addresses__full_name__icontains=search)
            | Q(addresses__phone__icontains=search)
        ).distinct()
    return queryset.order_by("-date_joined")


def get_user_by_id(user_id: str | UUID, *, include_deleted: bool = False) -> User | None:
    queryset = User.objects.prefetch_related(
        _enabled_staff_permissions_prefetch(), _contact_address_prefetch()
    )
    if not include_deleted:
        queryset = queryset.filter(deleted_at__isnull=True)
    return queryset.filter(id=user_id).first()


def get_active_user_by_email(email: str) -> User | None:
    return active_users().filter(email__iexact=email).first()


def staff_users(*, include_inactive: bool = False, include_deleted: bool = False) -> QuerySet[User]:
    queryset = users_list(role=UserRole.STAFF, include_deleted=include_deleted)
    if not include_inactive:
        queryset = queryset.filter(is_active=True)
    return queryset


def user_permissions(user: User) -> list[str]:
    if user.is_superuser or user.role == UserRole.ADMIN:
        return ["*"]
    if user.role != UserRole.STAFF:
        return []
    cached = getattr(user, "_prefetched_enabled_staff_permissions", None)
    if cached is not None:
        return [permission.permission_code for permission in cached]
    return list(
        user.staff_permissions.filter(is_enabled=True).values_list("permission_code", flat=True)
    )


def is_last_active_admin(user: User) -> bool:
    if not (user.is_superuser or user.role == UserRole.ADMIN):
        return False
    return (
        active_users()
        .filter(Q(role=UserRole.ADMIN) | Q(is_superuser=True))
        .exclude(id=user.id)
        .count()
        == 0
    )


def get_active_otp(*, user: User, purpose: str) -> UserOTP | None:
    """The newest unconsumed, unexpired OTP for this user and purpose,
    regardless of what code was submitted.

    `get_valid_otp` matches on the code hash, so a wrong guess simply finds
    nothing — leaving nowhere to record the failed attempt. Looking the code
    up by user and purpose first gives the attempt counter a row to land on.
    """
    return (
        UserOTP.objects.filter(
            user=user,
            purpose=purpose,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )


def get_valid_otp(*, user: User, purpose: str, code_hash: str) -> UserOTP | None:
    return (
        UserOTP.objects.filter(
            user=user,
            purpose=purpose,
            code_hash=code_hash,
            consumed_at__isnull=True,
            expires_at__gt=timezone.now(),
        )
        .order_by("-created_at")
        .first()
    )
