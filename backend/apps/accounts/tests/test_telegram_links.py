"""Linking a staff account to a Telegram account: single-use, short-lived
codes kept only as a hash, one Telegram account per staff member."""

from __future__ import annotations

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.factories import StaffPermissionFactory
from apps.accounts.models import TelegramLink, UserOTP
from apps.accounts.selectors.telegram_links import get_linked_staff, telegram_recipient_ids
from apps.accounts.services.telegram_links import (
    create_telegram_link_code,
    link_telegram_account,
    unlink_telegram_account,
)
from apps.accounts.tests.helpers import create_user
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db

ORDERS = (StaffPermissionCode.ORDERS_VIEW, StaffPermissionCode.ORDERS_MANAGE)


def _staff(email: str, *codes: str, **fields):
    user = create_user(email=email, role=UserRole.STAFF, **fields)
    for code in codes:
        StaffPermissionFactory(user=user, permission_code=code)
    return user


def _refused(code: str, telegram_user_id: int = 7) -> str:
    with pytest.raises(BusinessRuleViolationError) as exc:
        link_telegram_account(code=code, telegram_user_id=telegram_user_id)
    return exc.value.code


def test_a_code_links_the_staff_member_who_generated_it():
    staff = _staff("link@example.com")
    code = create_telegram_link_code(user=staff)

    assert link_telegram_account(code=f" {code.lower()} ", telegram_user_id=7) == staff

    assert get_linked_staff(7) == staff
    assert code not in UserOTP.objects.get(user=staff).code_hash  # only the hash is kept


def test_a_code_works_once():
    code = create_telegram_link_code(user=_staff("once@example.com"))
    link_telegram_account(code=code, telegram_user_id=7)

    assert _refused(code, telegram_user_id=8) == "invalid_link_code"
    assert get_linked_staff(8) is None


def test_an_expired_or_replaced_code_is_refused():
    staff = _staff("expired@example.com")
    old = create_telegram_link_code(user=staff)
    new = create_telegram_link_code(user=staff)  # generating again retires the first
    assert _refused(old) == "invalid_link_code"

    UserOTP.objects.filter(user=staff).update(expires_at=timezone.now() - timedelta(seconds=1))
    assert _refused(new) == "invalid_link_code"
    assert not TelegramLink.objects.exists()


def test_a_wrong_code_and_a_customer_or_inactive_account_are_refused():
    assert _refused("NOTAREALCODE") == "invalid_link_code"

    customer_code = create_telegram_link_code(user=create_user(email="cust@example.com"))
    assert _refused(customer_code) == "invalid_link_code"

    inactive = _staff("gone@example.com", is_active=False)
    assert _refused(create_telegram_link_code(user=inactive)) == "invalid_link_code"
    assert not TelegramLink.objects.exists()


def test_one_telegram_account_cannot_be_linked_to_two_staff_accounts():
    link_telegram_account(
        code=create_telegram_link_code(user=_staff("first@example.com")), telegram_user_id=7
    )
    second = _staff("second@example.com")

    assert _refused(create_telegram_link_code(user=second)) == "telegram_already_linked"
    assert not TelegramLink.objects.filter(user=second).exists()


def test_relinking_replaces_the_telegram_account_and_unlinking_removes_it():
    staff = _staff("relink@example.com")
    link_telegram_account(code=create_telegram_link_code(user=staff), telegram_user_id=7)
    link_telegram_account(code=create_telegram_link_code(user=staff), telegram_user_id=8)

    assert get_linked_staff(7) is None
    assert get_linked_staff(8) == staff

    unlink_telegram_account(user=staff)
    assert get_linked_staff(8) is None


def test_a_deactivated_staff_member_stops_being_a_linked_staff_member():
    staff = _staff("deactivated@example.com", StaffPermissionCode.ORDERS_VIEW)
    link_telegram_account(code=create_telegram_link_code(user=staff), telegram_user_id=7)

    staff.is_active = False
    staff.save(update_fields=["is_active"])

    assert get_linked_staff(7) is None
    assert telegram_recipient_ids(ORDERS) == []


def test_recipients_are_admins_and_staff_holding_the_permission(django_assert_num_queries):
    people = {
        1: create_user(email="admin@example.com", role=UserRole.ADMIN),
        2: _staff("viewer@example.com", StaffPermissionCode.ORDERS_VIEW),
        3: _staff("both@example.com", *ORDERS),
        4: _staff("other@example.com", StaffPermissionCode.USERS_VIEW),
    }
    for telegram_user_id, user in people.items():
        TelegramLink.objects.create(user=user, telegram_user_id=telegram_user_id)
    disabled = _staff("disabled@example.com")
    StaffPermissionFactory(
        user=disabled, permission_code=StaffPermissionCode.ORDERS_VIEW, is_enabled=False
    )
    TelegramLink.objects.create(user=disabled, telegram_user_id=5)

    with django_assert_num_queries(1):
        recipients = telegram_recipient_ids(ORDERS)

    assert sorted(recipients) == [1, 2, 3]


def test_dashboard_endpoint_issues_a_code_reports_the_link_and_unlinks(api_client):
    staff = _staff("api@example.com", StaffPermissionCode.ORDERS_VIEW)
    api_client.force_authenticate(user=staff)
    url = "/api/v1/admin/staff/telegram-link/"

    assert api_client.get(url).data["data"]["linked"] is False
    code = api_client.post(url).data["data"]["code"]
    link_telegram_account(code=code, telegram_user_id=7)
    assert api_client.get(url).data["data"]["linked"] is True

    assert api_client.delete(url).status_code == 204
    assert api_client.get(url).data["data"]["linked"] is False


def test_dashboard_endpoint_is_closed_to_anyone_without_an_order_permission(api_client):
    url = "/api/v1/admin/staff/telegram-link/"
    assert api_client.post(url).status_code == 401

    for user in (
        create_user(email="customer@example.com"),
        _staff("no-orders@example.com", StaffPermissionCode.USERS_VIEW),
    ):
        api_client.force_authenticate(user=user)
        assert api_client.post(url).status_code == 403
    assert not UserOTP.objects.exists()
