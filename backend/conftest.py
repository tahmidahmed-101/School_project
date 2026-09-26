from __future__ import annotations

import pytest

from apps.accounts.factories import (
    AddressFactory,
    AdminUserFactory,
    CustomerUserFactory,
    StaffUserFactory,
    SuperUserFactory,
)


@pytest.fixture
def user_factory():
    from apps.accounts.factories import UserFactory

    return UserFactory


@pytest.fixture
def api_client():
    from rest_framework.test import APIClient

    return APIClient()


@pytest.fixture
def customer_user():
    return CustomerUserFactory()


@pytest.fixture
def admin_user():
    return AdminUserFactory()


@pytest.fixture
def superuser():
    return SuperUserFactory()


@pytest.fixture
def staff_user():
    return StaffUserFactory()


@pytest.fixture
def address(customer_user):
    return AddressFactory(user=customer_user)


@pytest.fixture(autouse=True)
def _isolate_seeded_shipping_zones(db):  # noqa: ARG001 -- needed only to enable db access
    """Migrations seed live ops zones (Inside/Outside Dhaka and their rates).
    Left in place they out-match the zones tests build, so quotes resolve to the
    seeded rate instead of the fixture's."""
    from apps.logistics.models import ShippingZone

    ShippingZone.objects.all().delete()
