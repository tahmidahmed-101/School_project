from __future__ import annotations

from uuid import UUID

from django.db.models import QuerySet

from apps.accounts.models import Notification


def notifications_for_user(user, *, unread_only: bool = False) -> QuerySet[Notification]:
    queryset = Notification.objects.filter(user=user)
    if unread_only:
        queryset = queryset.filter(read_at__isnull=True)
    return queryset


def unread_notification_count(user) -> int:
    return Notification.objects.filter(user=user, read_at__isnull=True).count()


def get_notification_for_user(user, notification_id: str | UUID) -> Notification | None:
    """Scoped to the owner, so someone else's notification reads as missing."""
    return Notification.objects.filter(user=user, id=notification_id).first()
