from __future__ import annotations

import pytest

from apps.accounts.constants import UserRole
from apps.accounts.services.groups import sync_role_group
from apps.accounts.services.users import create_user, set_user_role
from apps.accounts.tests.helpers import create_user as make_user

pytestmark = pytest.mark.django_db


def test_create_user_adds_matching_role_group():
    user = create_user(email="group-customer@example.com", password="StrongPass123!")

    assert user.groups.filter(name="Customer").exists()
    assert not user.groups.filter(name__in=["Admin", "Staff"]).exists()


def test_set_user_role_moves_user_between_groups():
    admin = make_user(email="group-admin@example.com", role=UserRole.ADMIN)
    target = make_user(email="group-target@example.com")
    sync_role_group(target)
    assert target.groups.filter(name="Customer").exists()

    set_user_role(actor=admin, target_user=target, role=UserRole.STAFF)
    target.refresh_from_db()

    assert target.groups.filter(name="Staff").exists()
    assert not target.groups.filter(name="Customer").exists()


def test_sync_role_group_is_idempotent():
    user = make_user(email="group-idempotent@example.com")

    sync_role_group(user)
    sync_role_group(user)

    assert list(user.groups.values_list("name", flat=True)) == ["Customer"]
