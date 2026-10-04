from __future__ import annotations

from uuid import UUID

from django.utils import timezone

from apps.accounts.models import Notification


def notify(
    *, user, kind: str, title: str, message: str = "", object_id: UUID | None = None
) -> Notification | None:
    """Record an in-app notification. Guest identities cannot sign in to read
    one, so they are skipped rather than collecting rows nobody will see."""
    if user is None or user.is_guest:
        return None
    return Notification.objects.create(
        user=user, kind=kind, title=title, message=message, object_id=object_id
    )


def mark_notification_read(*, notification: Notification) -> Notification:
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=["read_at"])
    return notification


def mark_all_notifications_read(*, user) -> int:
    """One UPDATE for every unread row, however many there are."""
    return Notification.objects.filter(user=user, read_at__isnull=True).update(
        read_at=timezone.now()
    )
