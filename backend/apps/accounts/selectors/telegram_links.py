from __future__ import annotations

from django.db.models import Q

from apps.accounts.constants import UserRole
from apps.accounts.models import TelegramLink, User


def _active_staff() -> Q:
    return Q(
        user__is_active=True,
        user__deleted_at__isnull=True,
        user__role__in=(UserRole.ADMIN, UserRole.STAFF),
    )


def get_telegram_link(user) -> TelegramLink | None:
    return TelegramLink.objects.filter(user=user).first()


def get_linked_staff(telegram_user_id: int) -> User | None:
    """The active staff account bound to this Telegram account, if any."""
    link = (
        TelegramLink.objects.select_related("user")
        .filter(_active_staff(), telegram_user_id=telegram_user_id)
        .first()
    )
    return link.user if link else None


def telegram_recipient_ids(codes) -> list[int]:
    """Telegram ids of every linked, active admin or staff member holding one
    of `codes`, in one query however many staff there are."""
    holds_permission = Q(
        user__staff_permissions__permission_code__in=codes,
        user__staff_permissions__is_enabled=True,
    )
    return list(
        TelegramLink.objects.filter(_active_staff())
        .filter(Q(user__is_superuser=True) | Q(user__role=UserRole.ADMIN) | holds_permission)
        .values_list("telegram_user_id", flat=True)
        .distinct()
    )
