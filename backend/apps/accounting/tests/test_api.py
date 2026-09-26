from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from apps.accounting.factories import AccountFactory
from apps.accounting.models import Account
from apps.accounting.services.journal import post_journal_entry, reverse_journal_entry
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db


def test_staff_without_permission_cannot_view_accounts(api_client):
    staff = create_user(email="acct-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/accounting/accounts/")

    assert response.status_code == 403


def test_staff_with_view_permission_can_list_accounts(api_client):
    staff = create_user(email="acct-staff-view@example.com", role=UserRole.STAFF)
    admin = create_user(email="acct-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ACCOUNTING_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    AccountFactory()

    response = api_client.get("/api/v1/admin/accounting/accounts/")

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_admin_can_fetch_profit_and_loss_report(api_client):
    admin = create_user(email="acct-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get(
        "/api/v1/admin/accounting/reports/profit-and-loss/",
        {"start": "2026-01-01", "end": "2026-12-31"},
    )

    assert response.status_code == 200
    assert "net_income" in response.data["data"]


def test_admin_can_fetch_inventory_valuation_report(api_client):
    admin = create_user(email="acct-admin-2@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.get("/api/v1/admin/accounting/reports/inventory-valuation/")

    assert response.status_code == 200
    assert "inventory_value" in response.data["data"]


def _posted_entry():
    debit_account = AccountFactory(code="9500", type=Account.Type.ASSET)
    credit_account = AccountFactory(code="9501", type=Account.Type.LIABILITY)
    return post_journal_entry(
        entry_date=date.today(),
        description="API posting",
        lines=[
            {"account": debit_account, "debit": Decimal("40"), "credit": Decimal("0")},
            {"account": credit_account, "debit": Decimal("0"), "credit": Decimal("40")},
        ],
    )


def test_admin_can_reverse_a_journal_entry(api_client):
    admin = create_user(email="je-reverse-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    entry = _posted_entry()

    response = api_client.post(
        f"/api/v1/admin/accounting/journal-entries/{entry.id}/reverse/",
        {"reason": "Keyed twice"},
        format="json",
    )

    assert response.status_code == 201
    assert response.data["data"]["reverses_id"] == str(entry.id)
    assert "Keyed twice" in response.data["data"]["description"]
    entry.refresh_from_db()
    assert entry.status == "posted"


def test_reversing_a_journal_entry_twice_is_rejected(api_client):
    admin = create_user(email="je-reverse-twice@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    entry = _posted_entry()
    url = f"/api/v1/admin/accounting/journal-entries/{entry.id}/reverse/"

    assert api_client.post(url, {}, format="json").status_code == 201
    response = api_client.post(url, {}, format="json")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "already_reversed"


def test_reversing_an_unknown_journal_entry_returns_404(api_client):
    admin = create_user(email="je-reverse-404@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)

    response = api_client.post(
        f"/api/v1/admin/accounting/journal-entries/{uuid4()}/reverse/", {}, format="json"
    )

    assert response.status_code == 404


def test_view_only_staff_cannot_reverse_a_journal_entry(api_client):
    staff = create_user(email="je-reverse-viewer@example.com", role=UserRole.STAFF)
    admin = create_user(email="je-reverse-granter@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ACCOUNTING_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    entry = _posted_entry()

    response = api_client.post(
        f"/api/v1/admin/accounting/journal-entries/{entry.id}/reverse/", {}, format="json"
    )

    assert response.status_code == 403


def test_journal_entry_list_exposes_the_reversal_link(api_client):
    admin = create_user(email="je-reverse-list@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    entry = _posted_entry()
    reversal = reverse_journal_entry(entry)

    response = api_client.get("/api/v1/admin/accounting/journal-entries/")

    assert response.status_code == 200
    rows = {row["id"]: row for row in response.data["data"]["results"]}
    assert rows[str(entry.id)]["reversed_by_id"] == str(reversal.id)
    assert rows[str(reversal.id)]["reverses_id"] == str(entry.id)
