from __future__ import annotations

import pytest

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import (
    AddressFactory,
    AdminUserFactory,
    CustomerUserFactory,
    StaffPermissionFactory,
    StaffUserFactory,
    SuperUserFactory,
    UserOTPFactory,
)
from apps.accounts.models import UserOTP

pytestmark = pytest.mark.django_db


def test_account_factories_create_valid_models():
    customer = CustomerUserFactory()
    admin = AdminUserFactory()
    superuser = SuperUserFactory()
    staff = StaffUserFactory()
    address = AddressFactory(user=customer, is_default=True)
    permission = StaffPermissionFactory(user=staff)
    otp = UserOTPFactory(user=customer)

    assert customer.role == UserRole.CUSTOMER
    assert customer.check_password("StrongPass123!")
    assert admin.role == UserRole.ADMIN
    assert superuser.is_superuser is True
    assert staff.role == UserRole.STAFF
    assert address.user == customer
    assert permission.permission_code == StaffPermissionCode.USERS_VIEW
    assert otp.purpose == UserOTP.Purpose.EMAIL_VERIFICATION
    assert otp.is_expired is False
