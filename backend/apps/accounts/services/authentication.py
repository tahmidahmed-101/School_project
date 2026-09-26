from __future__ import annotations

import contextlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.utils import datetime_from_epoch

from apps.accounts.models import User, UserOTP
from apps.accounts.selectors.users import get_active_otp, get_active_user_by_email
from apps.accounts.services.sessions import revoke_all_sessions
from apps.audit.services.audit import record_login_attempt
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.utils.codes import generate_numeric_code, hash_code

OTP_EXPIRY_MINUTES = 10

# Kept as module-level names (rather than inlined calls) since existing tests
# import them directly; the implementation lives in apps.common.utils.codes.
_hash_code = hash_code


def _generate_code() -> str:
    return generate_numeric_code(6)


def consume_otp(*, user: User, purpose: str, code: str, error_message: str) -> UserOTP:
    """Check a submitted OTP and consume it, counting failures against the code.

    Every wrong guess increments `attempts` on the outstanding code; after
    `UserOTP.MAX_ATTEMPTS` the code is dead and the user must request a new
    one. Without this, a six-digit code could be guessed by brute force
    within its own validity window.

    The same message is raised whether the code is wrong, expired, missing or
    locked — distinguishing them would tell an attacker whether they are
    guessing against a live code.

    Must be called *outside* an enclosing `transaction.atomic()` block: the
    failed-attempt counter is written and then an exception is raised, so an
    outer transaction would roll the increment back and the lock would never
    engage no matter how many guesses were made.
    """
    otp = get_active_otp(user=user, purpose=purpose)
    if otp is None or otp.is_locked:
        raise BusinessRuleViolationError(error_message, code="invalid_otp")

    # compare_digest keeps the comparison time independent of how many leading
    # characters happen to match.
    if not secrets.compare_digest(otp.code_hash, _hash_code(code)):
        otp.record_failed_attempt()
        raise BusinessRuleViolationError(error_message, code="invalid_otp")

    otp.consume()
    return otp


def issue_tokens(user: User, *, remember_me: bool = False) -> dict[str, str]:
    refresh = RefreshToken.for_user(user)
    if remember_me:
        # `for_user` already snapshotted an OutstandingToken row with the
        # default lifetime; extend the token in-memory then sync that row
        # (expiry + encoded string) so session listing/revocation stays
        # consistent with the token actually returned to the client.
        refresh.set_exp(lifetime=settings.REMEMBER_ME_REFRESH_TOKEN_LIFETIME)
        OutstandingToken.objects.filter(jti=refresh["jti"]).update(
            expires_at=datetime_from_epoch(refresh["exp"]),
            token=str(refresh),
        )
    return {"access": str(refresh.access_token), "refresh": str(refresh)}


@transaction.atomic
def register_customer(
    *,
    email: str,
    password: str,
    first_name: str = "",
    last_name: str = "",
    phone: str = "",
) -> User:
    from apps.accounts.services.users import create_user

    return create_user(
        email=email,
        password=password,
        first_name=first_name,
        last_name=last_name,
        phone=phone,
        role="customer",
    )


def authenticate_user(*, email: str, password: str) -> User:
    user = authenticate(username=email, password=password)
    if not user or not user.is_active or user.deleted_at is not None:
        record_login_attempt(user=None, email=email, was_successful=False)
        raise BusinessRuleViolationError("Invalid credentials.", code="auth_invalid_credentials")
    record_login_attempt(user=user, email=user.email, was_successful=True)
    return user


def rotate_refresh_token(refresh_token: str) -> dict[str, str]:
    """Exchange a refresh token for a fresh access token, rotating the refresh
    token itself when `SIMPLE_JWT["ROTATE_REFRESH_TOKENS"]` is on.

    Building `RefreshToken(...)` by hand and returning only a new access token
    silently ignores those settings: the same long-lived refresh token stays
    valid for its full lifetime and can be replayed by anyone who copies it.
    Rotating means a stolen token is usable at most until the legitimate
    client next refreshes, at which point the thief's copy is blacklisted.

    The new token inherits the original's expiry rather than extending it, so
    a session — including a `remember_me` one, which carries a longer
    lifetime than the default — has a fixed end date and cannot be renewed
    indefinitely by refreshing.
    """
    try:
        token = RefreshToken(refresh_token)  # type: ignore[arg-type]
    except Exception as exc:
        raise BusinessRuleViolationError(
            "Invalid refresh token.", code="auth_invalid_refresh"
        ) from exc

    result = {"access": str(token.access_token)}
    if not api_settings.ROTATE_REFRESH_TOKENS:
        return result

    session_end = token["exp"]
    user_id = token.get(api_settings.USER_ID_CLAIM)

    if api_settings.BLACKLIST_AFTER_ROTATION:
        # token_blacklist app not installed — rotation still applies.
        with contextlib.suppress(AttributeError):
            token.blacklist()

    token.set_jti()
    token.set_iat()
    # Inherit the original expiry rather than calling set_exp(): the session
    # then has a fixed end date that refreshing cannot push out, and a
    # `remember_me` token — whose lifetime is longer than the default — is not
    # silently truncated back to REFRESH_TOKEN_LIFETIME on its first refresh.
    token.payload["exp"] = session_end

    # Register the replacement so it shows up in "manage your devices" and
    # stays revocable; only `RefreshToken.for_user` does this automatically.
    if user_id is not None:
        OutstandingToken.objects.get_or_create(
            jti=token["jti"],
            defaults={
                "user_id": user_id,
                "token": str(token),
                "created_at": token.current_time,
                "expires_at": datetime_from_epoch(token["exp"]),
            },
        )

    result["refresh"] = str(token)
    # So the caller's cookie expires with the token; a fixed 30-day max-age
    # left the cookie alive long after the token it carried had died.
    remaining = datetime_from_epoch(session_end) - timezone.now()
    result["refresh_max_age"] = str(max(int(remaining.total_seconds()), 0))
    return result


def logout_refresh_token(refresh_token: str) -> None:
    try:
        token = RefreshToken(refresh_token)  # type: ignore[arg-type]
        token.blacklist()
    except Exception as exc:
        raise BusinessRuleViolationError(
            "Invalid refresh token.", code="auth_invalid_refresh"
        ) from exc


@transaction.atomic
def change_password(*, user: User, old_password: str, new_password: str) -> None:
    if not user.check_password(old_password):
        raise BusinessRuleViolationError("Old password is incorrect.", code="invalid_old_password")
    validate_password(new_password, user=user)
    user.set_password(new_password)
    user.save(update_fields=["password"])
    # No OTP involved here, so the atomic wrapper is safe.
    # Changing a password is the standard response to "someone else may be
    # logged in as me". Existing refresh tokens survive a password change on
    # their own, so revoke them; the caller re-authenticates.
    revoke_all_sessions(user=user)


@transaction.atomic
def create_otp(*, user: User, purpose: str) -> tuple[UserOTP, str]:
    # Retire outstanding codes: `get_active_otp` only returns the newest, so
    # older unconsumed rows survive as codes nothing can ever redeem.
    UserOTP.objects.filter(user=user, purpose=purpose, consumed_at__isnull=True).update(
        consumed_at=timezone.now()
    )
    code = _generate_code()
    otp = UserOTP.objects.create(
        user=user,
        purpose=purpose,
        code_hash=_hash_code(code),
        expires_at=timezone.now() + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    return otp, code


def request_email_verification(user: User) -> None:
    _, code = create_otp(user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION)
    send_mail(
        "Verify your email",
        f"Your verification code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes.",
        None,
        [user.email],
        fail_silently=False,
    )


def verify_email(*, user: User, code: str) -> None:
    # Not wrapped in a transaction: see `consume_otp`, whose attempt counter
    # must survive the exception it raises on a wrong code.
    consume_otp(
        user=user,
        purpose=UserOTP.Purpose.EMAIL_VERIFICATION,
        code=code,
        error_message="Invalid or expired verification code.",
    )
    user.is_email_verified = True
    user.save(update_fields=["is_email_verified"])


def request_password_reset(email: str) -> None:
    user = get_active_user_by_email(email)
    if user is None:
        return
    _, code = create_otp(user=user, purpose=UserOTP.Purpose.PASSWORD_RESET)
    send_mail(
        "Reset your password",
        f"Your password reset code is {code}. It expires in {OTP_EXPIRY_MINUTES} minutes.",
        None,
        [user.email],
        fail_silently=False,
    )


def reset_password(*, email: str, code: str, new_password: str) -> None:
    user = get_active_user_by_email(email)
    if user is None:
        raise BusinessRuleViolationError("Invalid or expired reset code.", code="invalid_otp")

    # Validate the new password first so a rejected one doesn't burn the code
    # and force the user to request another.
    validate_password(new_password, user=user)
    # Outside any transaction — `consume_otp` records failed attempts.
    consume_otp(
        user=user,
        purpose=UserOTP.Purpose.PASSWORD_RESET,
        code=code,
        error_message="Invalid or expired reset code.",
    )

    with transaction.atomic():
        user.set_password(new_password)
        user.save(update_fields=["password"])
        # A reset is how someone recovers a compromised account, so any
        # session the attacker still holds has to die with the old password —
        # otherwise their refresh token keeps working and the reset achieves
        # nothing.
        revoke_all_sessions(user=user)
