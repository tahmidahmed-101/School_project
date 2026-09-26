from __future__ import annotations

from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.utils import timezone


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
