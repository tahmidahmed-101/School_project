"""Authentication hardening.

Covers the ways an account could previously be taken over or kept: brute
forcing a six-digit OTP inside its validity window, and holding a stolen
refresh token across the victim's password change.
"""

from __future__ import annotations

import pytest
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken

from apps.accounts.factories import CustomerUserFactory
from apps.accounts.models import UserOTP
from apps.accounts.selectors.sessions import active_sessions_for_user
from apps.accounts.services import authentication
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


# --------------------------------------------------------------------------
# OTP brute force
# --------------------------------------------------------------------------


def test_otp_locks_after_repeated_wrong_codes():
    user = CustomerUserFactory()
    _, correct_code = authentication.create_otp(
        user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION
    )
    wrong_code = "000000" if correct_code != "000000" else "111111"

    for _ in range(UserOTP.MAX_ATTEMPTS):
        with pytest.raises(BusinessRuleViolationError):
            authentication.verify_email(user=user, code=wrong_code)

    # Even the *correct* code is refused once the attempt budget is spent —
    # otherwise an attacker just keeps guessing until they hit it.
    with pytest.raises(BusinessRuleViolationError) as exc:
        authentication.verify_email(user=user, code=correct_code)
    assert exc.value.code == "invalid_otp"

    user.refresh_from_db()
    assert user.is_email_verified is False


def test_wrong_codes_are_counted_on_the_outstanding_otp():
    user = CustomerUserFactory()
    otp, correct_code = authentication.create_otp(
        user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION
    )
    wrong_code = "000000" if correct_code != "000000" else "111111"

    with pytest.raises(BusinessRuleViolationError):
        authentication.verify_email(user=user, code=wrong_code)

    otp.refresh_from_db()
    assert otp.attempts == 1
    assert not otp.is_locked


def test_a_correct_code_still_works_within_the_attempt_budget():
    user = CustomerUserFactory()
    _, correct_code = authentication.create_otp(
        user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION
    )
    wrong_code = "000000" if correct_code != "000000" else "111111"

    with pytest.raises(BusinessRuleViolationError):
        authentication.verify_email(user=user, code=wrong_code)
    authentication.verify_email(user=user, code=correct_code)

    user.refresh_from_db()
    assert user.is_email_verified is True


def test_a_consumed_code_cannot_be_replayed():
    user = CustomerUserFactory()
    _, code = authentication.create_otp(user=user, purpose=UserOTP.Purpose.EMAIL_VERIFICATION)
    authentication.verify_email(user=user, code=code)

    with pytest.raises(BusinessRuleViolationError) as exc:
        authentication.verify_email(user=user, code=code)
    assert exc.value.code == "invalid_otp"


def test_password_reset_otp_is_also_attempt_limited():
    user = CustomerUserFactory(email="reset-target@example.com")
    _, correct_code = authentication.create_otp(user=user, purpose=UserOTP.Purpose.PASSWORD_RESET)
    wrong_code = "000000" if correct_code != "000000" else "111111"

    for _ in range(UserOTP.MAX_ATTEMPTS):
        with pytest.raises(BusinessRuleViolationError):
            authentication.reset_password(
                email=user.email, code=wrong_code, new_password="BrandNewPass123"
            )

    with pytest.raises(BusinessRuleViolationError):
        authentication.reset_password(
            email=user.email, code=correct_code, new_password="BrandNewPass123"
        )
    user.refresh_from_db()
    assert not user.check_password("BrandNewPass123")


# --------------------------------------------------------------------------
# Sessions must not outlive the password they were issued under
# --------------------------------------------------------------------------


def test_changing_the_password_revokes_existing_sessions():
    user = CustomerUserFactory()
    user.set_password("OriginalPass123")
    user.save(update_fields=["password"])
    tokens = authentication.issue_tokens(user)
    assert active_sessions_for_user(user).count() == 1

    authentication.change_password(
        user=user, old_password="OriginalPass123", new_password="ReplacementPass123"
    )

    assert active_sessions_for_user(user).count() == 0
    assert BlacklistedToken.objects.filter(token__user=user).exists()

    # The old refresh token is dead, so a stolen copy is worthless.
    with pytest.raises(BusinessRuleViolationError):
        authentication.rotate_refresh_token(tokens["refresh"])


def test_resetting_the_password_revokes_existing_sessions():
    """The whole point of a reset is to lock out whoever had the old
    credentials — a surviving refresh token would defeat it."""
    user = CustomerUserFactory(email="hijacked@example.com")
    tokens = authentication.issue_tokens(user)
    _, code = authentication.create_otp(user=user, purpose=UserOTP.Purpose.PASSWORD_RESET)

    authentication.reset_password(email=user.email, code=code, new_password="RecoveredPass123")

    assert active_sessions_for_user(user).count() == 0
    with pytest.raises(BusinessRuleViolationError):
        authentication.rotate_refresh_token(tokens["refresh"])


def test_a_failed_password_change_leaves_sessions_alone():
    user = CustomerUserFactory()
    user.set_password("OriginalPass123")
    user.save(update_fields=["password"])
    authentication.issue_tokens(user)

    with pytest.raises(BusinessRuleViolationError):
        authentication.change_password(
            user=user, old_password="WrongOldPass123", new_password="ReplacementPass123"
        )

    assert active_sessions_for_user(user).count() == 1


# --------------------------------------------------------------------------
# Account enumeration
# --------------------------------------------------------------------------


def test_login_does_not_reveal_whether_an_account_exists(api_client):
    CustomerUserFactory(email="known@example.com")

    known = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "known@example.com", "password": "definitely-wrong"},
        format="json",
    )
    unknown = api_client.post(
        "/api/v1/customer/auth/login/",
        {"email": "nobody@example.com", "password": "definitely-wrong"},
        format="json",
    )

    assert known.status_code == unknown.status_code == 401
    assert known.data["error"]["code"] == unknown.data["error"]["code"]
    assert known.data["error"]["message"] == unknown.data["error"]["message"]


def test_forgot_password_does_not_reveal_whether_an_account_exists(api_client):
    CustomerUserFactory(email="real@example.com")

    known = api_client.post(
        "/api/v1/customer/auth/forgot-password/", {"email": "real@example.com"}, format="json"
    )
    unknown = api_client.post(
        "/api/v1/customer/auth/forgot-password/", {"email": "fake@example.com"}, format="json"
    )

    assert known.status_code == unknown.status_code
