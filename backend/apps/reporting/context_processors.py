from django.core.cache import cache
from django.db.utils import OperationalError, ProgrammingError
from django.utils import timezone

from apps.audit.models import LoginHistory

_CACHE_KEY = "reporting:admin_dashboard_stats"
_CACHE_TTL_SECONDS = 30
_WINDOW_HOURS = 24


def admin_dashboard_stats(request):
    """Cheap read-only signals for spotting production issues from the admin
    index. Only runs on /admin/ pages, and degrades to an empty dict if the
    tables aren't migrated yet — this is a glance, not a report.

    Cached briefly since these counts are global (not per-user) and this
    context processor otherwise re-runs them on every admin page view.
    """
    if not request.path.startswith("/admin/"):
        return {}
    stats = cache.get(_CACHE_KEY)
    if stats is None:
        since = timezone.now() - timezone.timedelta(hours=_WINDOW_HOURS)
        try:
            stats = {
                "failed_logins": LoginHistory.objects.filter(
                    was_successful=False, created_at__gte=since
                ).count(),
            }
        except (OperationalError, ProgrammingError):
            return {}
        cache.set(_CACHE_KEY, stats, _CACHE_TTL_SECONDS)
    return {"admin_stats": stats}
