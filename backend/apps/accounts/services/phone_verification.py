from __future__ import annotations

from apps.accounts.models import User, UserOTP
from apps.accounts.services.authentication import consume_otp, create_otp
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.sms import send_sms

OTP_EXPIRY_MINUTES = 10


def _send_otp(*, user: User, purpose: str, body: str, to: str) -> None:
    """Issue a code and text it, with the Twilio call outside any transaction.

    Sending is a synchronous HTTP round-trip; inside `atomic()` it would hold a
    database connection open for its whole duration. The code is deleted again
    if delivery fails so a dead code can't occupy the one active-OTP slot.
    """
    otp, code = create_otp(user=user, purpose=purpose)
    if not send_sms(to=to, body=body.format(code=code)):
        otp.delete()
        raise BusinessRuleViolationError("Failed to send SMS.", code="sms_send_failed")


def request_phone_verification(*, user: User) -> None:
    if user.is_phone_verified:
        raise BusinessRuleViolationError(
            "Phone is already verified.", code="phone_already_verified"
        )

    if not user.phone:
        raise BusinessRuleViolationError("No phone number on file.", code="no_phone")

    _send_otp(
        user=user,
        purpose=UserOTP.Purpose.PHONE_VERIFICATION,
        to=user.phone,
        body=f"Your verification code is {{code}}. It expires in {OTP_EXPIRY_MINUTES} minutes.",
    )


def verify_phone(*, user: User, code: str) -> None:
    # Not wrapped in a transaction: `consume_otp` records failed attempts and
    # then raises, so an enclosing atomic block would roll the counter back
    # and the code could be guessed without limit.
    consume_otp(
        user=user,
        purpose=UserOTP.Purpose.PHONE_VERIFICATION,
        code=code,
        error_message="Invalid or expired verification code.",
    )
    user.is_phone_verified = True
    user.save(update_fields=["is_phone_verified"])


def request_phone_change(*, user: User, new_phone: str) -> None:
    if not new_phone:
        raise BusinessRuleViolationError("New phone number is required.", code="phone_required")
    _assert_phone_available(new_phone, exclude_user=user)

    _send_otp(
        user=user,
        purpose=UserOTP.Purpose.PHONE_CHANGE,
        to=new_phone,
        body=f"Your phone change code is {{code}}. It expires in {OTP_EXPIRY_MINUTES} minutes.",
    )


def confirm_phone_change(*, user: User, code: str, new_phone: str) -> None:
    # See `verify_phone` — must stay outside a transaction.
    consume_otp(
        user=user,
        purpose=UserOTP.Purpose.PHONE_CHANGE,
        code=code,
        error_message="Invalid or expired verification code.",
    )
    # Re-checked here, not just at request time: another account may have
    # claimed the number during the code's ten-minute window.
    _assert_phone_available(new_phone, exclude_user=user)
    user.phone = new_phone
    user.is_phone_verified = True
    user.save(update_fields=["phone", "is_phone_verified"])


def _assert_phone_available(phone: str, *, exclude_user: User) -> None:
    # Guest-checkout identities don't own their number — anyone can type one —
    # so they never stop the real owner from verifying it on an account.
    taken = (
        User.objects.filter(phone=phone, deleted_at__isnull=True, is_guest=False)
        .exclude(pk=exclude_user.pk)
        .exists()
    )
    if taken:
        raise BusinessRuleViolationError(
            "That phone number is already in use.", code="phone_already_exists"
        )
