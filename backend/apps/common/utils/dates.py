from __future__ import annotations

from datetime import date, datetime, time, timedelta
from datetime import timezone as dt_timezone

from django.conf import settings
from django.utils import timezone

# Bangladesh has no DST, and a fixed offset needs no tzdata in a slim image.
DHAKA = dt_timezone(timedelta(hours=6), "Asia/Dhaka")


def day_start(day: date) -> datetime:
    """Midnight at the start of `day`, in the active timezone.

    Filtering a datetime column with `__date__gte` wraps it in a cast that
    Postgres cannot answer from the column's own index; comparing against a
    plain datetime bound can.
    """
    naive = datetime.combine(day, time.min)
    if not settings.USE_TZ:
        return naive
    return timezone.make_aware(naive, timezone.get_current_timezone())


def day_after(day: date) -> datetime:
    """Midnight ending `day` — the exclusive upper bound for an inclusive
    `<= day` range."""
    return day_start(day + timedelta(days=1))


def dhaka_day_start(now: datetime | None = None) -> datetime:
    """Midnight of the current Bangladesh day. The project runs in UTC, where
    a Dhaka evening is already tomorrow."""
    local = (now or timezone.now()).astimezone(DHAKA)
    return datetime.combine(local.date(), time.min, tzinfo=DHAKA)
