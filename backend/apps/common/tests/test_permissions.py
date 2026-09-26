from __future__ import annotations

import pytest
from rest_framework.test import APIRequestFactory

from apps.accounts.constants import StaffPermissionCode
from apps.accounts.factories import StaffPermissionFactory
from apps.accounts.tests.helpers import create_user
from apps.common.permissions import require_staff_permission

pytestmark = pytest.mark.django_db

factory = APIRequestFactory()


class _View:
    pass


def test_require_staff_permission_grants_access_when_enabled():
    staff = create_user(email="perm-staff@example.com")
    from apps.accounts.constants import UserRole

    staff.role = UserRole.STAFF
    staff.save(update_fields=["role"])
    StaffPermissionFactory(
        user=staff, permission_code=StaffPermissionCode.USERS_VIEW, is_enabled=True
    )

    permission_cls = require_staff_permission(StaffPermissionCode.USERS_VIEW)
    request = factory.get("/")
    request.user = staff

    assert permission_cls().has_permission(request, _View()) is True


def test_require_staff_permission_denies_access_when_missing():
    customer = create_user(email="perm-customer@example.com")

    permission_cls = require_staff_permission(StaffPermissionCode.USERS_VIEW)
    request = factory.get("/")
    request.user = customer

    assert permission_cls().has_permission(request, _View()) is False


def test_require_staff_permission_always_allows_admin():
    from apps.accounts.constants import UserRole

    admin = create_user(email="perm-admin@example.com", role=UserRole.ADMIN)

    permission_cls = require_staff_permission(StaffPermissionCode.USERS_VIEW)
    request = factory.get("/")
    request.user = admin

    assert permission_cls().has_permission(request, _View()) is True
