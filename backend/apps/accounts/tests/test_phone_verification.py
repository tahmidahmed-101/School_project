from __future__ import annotations

from unittest.mock import patch

import pytest

from apps.accounts.models import UserOTP
from apps.accounts.services.phone_verification import (
    confirm_phone_change,
    request_phone_change,
    request_phone_verification,
    verify_phone,
)
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


class TestPhoneVerification:
    def test_request_verification_sends_sms(self, customer_user):
        customer_user.phone = "+15557000000"
        customer_user.save()

        with patch(
            "apps.accounts.services.phone_verification.send_sms",
            return_value=True,
        ) as mock_sms:
            request_phone_verification(user=customer_user)

        assert (
            UserOTP.objects.filter(
                user=customer_user,
                purpose=UserOTP.Purpose.PHONE_VERIFICATION,
            ).count()
            == 1
        )
        mock_sms.assert_called_once()
        assert "verification code" in mock_sms.call_args[1]["body"].lower()

    def test_request_verification_raises_if_already_verified(self, customer_user):
        customer_user.is_phone_verified = True
        customer_user.save()

        with pytest.raises(BusinessRuleViolationError, match="already verified"):
            request_phone_verification(user=customer_user)

    def test_request_verification_raises_if_no_phone(self, customer_user):
        customer_user.phone = ""
        customer_user.save()

        with pytest.raises(BusinessRuleViolationError, match=r"(?i)no phone"):
            request_phone_verification(user=customer_user)

    def test_request_verification_raises_if_sms_fails(self, customer_user):
        customer_user.phone = "+15557000000"
        customer_user.save()

        with (
            patch(
                "apps.accounts.services.phone_verification.send_sms",
                return_value=False,
            ),
            pytest.raises(BusinessRuleViolationError, match="Failed to send SMS"),
        ):
            request_phone_verification(user=customer_user)

    def test_verify_phone_with_valid_code(self, customer_user):
        customer_user.phone = "+15557000000"
        customer_user.save()

        with patch(
            "apps.accounts.services.phone_verification.send_sms",
            return_value=True,
        ):
            request_phone_verification(user=customer_user)

        otp = UserOTP.objects.get(
            user=customer_user,
            purpose=UserOTP.Purpose.PHONE_VERIFICATION,
        )
        from apps.accounts.services.authentication import _hash_code

        otp.code_hash = _hash_code("123456")
        otp.save(update_fields=["code_hash"])

        verify_phone(user=customer_user, code="123456")

        customer_user.refresh_from_db()
        assert customer_user.is_phone_verified is True
        otp.refresh_from_db()
        assert otp.is_consumed

    def test_verify_phone_with_invalid_code_raises(self, customer_user):
        customer_user.phone = "+15557000000"
        customer_user.save()

        with pytest.raises(BusinessRuleViolationError, match="Invalid or expired"):
            verify_phone(user=customer_user, code="000000")


class TestPhoneChange:
    def test_request_phone_change_sends_sms(self, customer_user):
        with patch(
            "apps.accounts.services.phone_verification.send_sms",
            return_value=True,
        ) as mock_sms:
            request_phone_change(
                user=customer_user,
                new_phone="+15551112222",
            )

        assert (
            UserOTP.objects.filter(
                user=customer_user,
                purpose=UserOTP.Purpose.PHONE_CHANGE,
            ).count()
            == 1
        )
        mock_sms.assert_called_once_with(
            to="+15551112222",
            body=mock_sms.call_args[1]["body"],
        )

    def test_request_phone_change_raises_if_no_phone(self, customer_user):
        with pytest.raises(BusinessRuleViolationError, match="required"):
            request_phone_change(user=customer_user, new_phone="")

    def test_confirm_phone_change_with_valid_code(self, customer_user):
        with patch(
            "apps.accounts.services.phone_verification.send_sms",
            return_value=True,
        ):
            request_phone_change(
                user=customer_user,
                new_phone="+15551112222",
            )

        otp = UserOTP.objects.get(
            user=customer_user,
            purpose=UserOTP.Purpose.PHONE_CHANGE,
        )
        from apps.accounts.services.authentication import _hash_code

        otp.code_hash = _hash_code("654321")
        otp.save(update_fields=["code_hash"])

        confirm_phone_change(
            user=customer_user,
            code="654321",
            new_phone="+15551112222",
        )

        customer_user.refresh_from_db()
        assert customer_user.phone == "+15551112222"
        assert customer_user.is_phone_verified is True
