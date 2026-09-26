from __future__ import annotations

import hashlib
from datetime import timedelta
from typing import cast

import factory
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.models import Address, StaffPermission, User, UserOTP


def hash_otp_code(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User
        django_get_or_create = ("email",)
        skip_postgeneration_save = True

    email = factory.Sequence(lambda n: f"user{n}@example.com")
    username = ""
    first_name = "Test"
    last_name = "User"
    role = UserRole.CUSTOMER
    phone = "+15550000000"
    profile_picture = ""
    is_active = True
    is_email_verified = False
    is_staff = False
    is_superuser = False

    @factory.post_generation
    def password(self, create: bool, extracted: str | None, **_kwargs) -> None:
        user = cast(User, self)
        raw_password = extracted or "StrongPass123!"
        user.set_password(raw_password)
        if create:
            user.save(update_fields=["password"])


class CustomerUserFactory(UserFactory):
    role = UserRole.CUSTOMER


class AdminUserFactory(UserFactory):
    role = UserRole.ADMIN


class SuperUserFactory(UserFactory):
    role = UserRole.ADMIN
    is_staff = True
    is_superuser = True


class StaffUserFactory(UserFactory):
    role = UserRole.STAFF


class AddressFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Address

    user = factory.SubFactory(CustomerUserFactory)
    full_name = "Jane Doe"
    phone = "+15550000000"
    line1 = factory.Sequence(lambda n: f"House {n}")
    line2 = ""
    city = "San Francisco"
    state = "CA"
    postal_code = "94105"
    country = "US"
    is_default = False


class StaffPermissionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = StaffPermission
        django_get_or_create = ("user", "permission_code")

    user = factory.SubFactory(StaffUserFactory)
    permission_code = StaffPermissionCode.USERS_VIEW
    is_enabled = True
    granted_by = factory.SubFactory(AdminUserFactory)
    granted_at = factory.LazyFunction(timezone.now)


class UserOTPFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = UserOTP

    user = factory.SubFactory(CustomerUserFactory)
    purpose = UserOTP.Purpose.EMAIL_VERIFICATION
    code_hash = factory.LazyFunction(lambda: hash_otp_code("123456"))
    expires_at = factory.LazyFunction(lambda: timezone.now() + timedelta(minutes=10))
    consumed_at = None
