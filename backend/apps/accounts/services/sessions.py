from __future__ import annotations

from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.selectors.sessions import active_sessions_for_user
from apps.common.exceptions import BusinessRuleViolationError


def revoke_session(*, user: User, session_id: int) -> None:
    outstanding = active_sessions_for_user(user).filter(id=session_id).first()
    if outstanding is None:
        raise BusinessRuleViolationError("Session not found.", code="session_not_found")
    RefreshToken(outstanding.token).blacklist()  # type: ignore[arg-type]


def revoke_all_sessions(*, user: User) -> int:
    """Blacklist every outstanding refresh token for the user.

    Used after a password change or reset: Django's `set_password` does not
    invalidate JWTs, so without this an attacker holding a stolen refresh
    token keeps their access even after the victim changes the password.
    """
    outstanding_tokens = list(active_sessions_for_user(user))
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding_tokens],
        ignore_conflicts=True,
    )
    return len(outstanding_tokens)


def revoke_other_sessions(*, user: User, current_refresh_token: str) -> int:
    try:
        current = RefreshToken(current_refresh_token)  # type: ignore[arg-type]
    except Exception as exc:
        raise BusinessRuleViolationError(
            "Invalid refresh token.", code="auth_invalid_refresh"
        ) from exc

    current_jti = current["jti"]
    outstanding_tokens = list(active_sessions_for_user(user).exclude(jti=current_jti))
    # Bulk-insert the blacklist rows directly instead of calling
    # RefreshToken(...).blacklist() per session, which re-parses each JWT
    # and re-queries OutstandingToken just to create the same row.
    BlacklistedToken.objects.bulk_create(
        [BlacklistedToken(token=token) for token in outstanding_tokens],
        ignore_conflicts=True,
    )
    return len(outstanding_tokens)
