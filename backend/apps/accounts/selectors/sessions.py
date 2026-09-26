from __future__ import annotations

from django.db.models import QuerySet
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.accounts.models import User


def active_sessions_for_user(user: User) -> QuerySet[OutstandingToken]:
    """Outstanding (non-blacklisted) refresh tokens for a user, i.e. their
    active login sessions/devices."""
    blacklisted_ids = BlacklistedToken.objects.values_list("token_id", flat=True)
    return (
        OutstandingToken.objects.filter(user=user)
        .exclude(id__in=blacklisted_ids)
        .order_by("-created_at")
    )
