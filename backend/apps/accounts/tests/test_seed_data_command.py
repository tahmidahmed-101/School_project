from __future__ import annotations

import pytest
from django.core.management import call_command

from apps.accounts.constants import UserRole
from apps.accounts.models import Address, StaffPermission, User

pytestmark = pytest.mark.django_db


def test_seed_data_command_creates_requested_demo_data_idempotently():
    call_command(
        "seed_data",
        customers=2,
        staff=1,
        admins=1,
        superusers=1,
        addresses_per_customer=2,
        prefix="pytest",
    )

    assert User.objects.filter(email__startswith="pytest-customer-").count() == 2
    assert User.objects.filter(email__startswith="pytest-staff-").count() == 1
    assert User.objects.filter(email__startswith="pytest-admin-").count() == 1
    assert User.objects.filter(email__startswith="pytest-superuser-").count() == 1
    assert Address.objects.filter(user__email__startswith="pytest-customer-").count() == 4

    staff = User.objects.get(email="pytest-staff-1@example.com")
    assert staff.role == UserRole.STAFF
    assert StaffPermission.objects.filter(user=staff, is_enabled=True).count() == 2

    call_command(
        "seed_data",
        customers=2,
        staff=1,
        admins=1,
        superusers=1,
        addresses_per_customer=2,
        prefix="pytest",
    )

    assert User.objects.filter(email__startswith="pytest-").count() == 5
    assert Address.objects.filter(user__email__startswith="pytest-customer-").count() == 4
