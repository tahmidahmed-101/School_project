from __future__ import annotations

import re
from typing import cast

from apps.accounts.constants import UserRole
from apps.accounts.factories import (
    AddressFactory,
    AdminUserFactory,
    CustomerUserFactory,
    StaffUserFactory,
    SuperUserFactory,
    UserFactory,
)
from apps.accounts.models import Address, User


def create_user(
    *,
    email: str = "user@example.com",
    password: str = "StrongPass123!",
    role: str = UserRole.CUSTOMER,
    is_active: bool = True,
    is_superuser: bool = False,
) -> User:
    factory_class = UserFactory
    if is_superuser:
        factory_class = SuperUserFactory
    elif role == UserRole.ADMIN:
        factory_class = AdminUserFactory
    elif role == UserRole.STAFF:
        factory_class = StaffUserFactory
    elif role == UserRole.CUSTOMER:
        factory_class = CustomerUserFactory

    return cast(
        User,
        factory_class(
            email=email,
            password=password,
            role=role,
            is_active=is_active,
            is_superuser=is_superuser,
        ),
    )


def create_address(*, user: User, is_default: bool = False, line1: str = "Line 1") -> Address:
    return cast(
        Address,
        AddressFactory(
            user=user,
            line1=line1,
            is_default=is_default,
        ),
    )


def extract_otp_code(message: str) -> str:
    match = re.search(r"\b(\d{6})\b", message)
    assert match is not None
    return match.group(1)
