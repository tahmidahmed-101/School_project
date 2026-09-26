from __future__ import annotations

import pytest

from apps.accounting.factories import AccountFactory, ExpenseFactory
from apps.accounting.models import Account
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db


def test_staff_without_permission_cannot_view_expenses(api_client):
    staff = create_user(email="expense-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    response = api_client.get("/api/v1/admin/accounting/expenses/")

    assert response.status_code == 403


def test_staff_without_post_permission_cannot_create_expense(api_client):
    staff = create_user(email="expense-staff-view@example.com", role=UserRole.STAFF)
    admin = create_user(email="expense-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ACCOUNTING_VIEW,
        is_enabled=True,
        granted_by=admin,
    )
    api_client.force_authenticate(user=staff)
    expense_account = AccountFactory(type=Account.Type.EXPENSE, code="9500")
    payment_account = AccountFactory(type=Account.Type.ASSET, code="9501")

    response = api_client.post(
        "/api/v1/admin/accounting/expenses/",
        {
            "expense_date": "2026-01-15",
            "payee": "City Power Co",
            "amount": "150.00",
            "expense_account_id": str(expense_account.id),
            "payment_account_id": str(payment_account.id),
        },
        format="json",
    )

    assert response.status_code == 403


def test_admin_can_create_expense_and_posts_balanced_journal_entry(api_client):
    admin = create_user(email="expense-admin@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    expense_account = AccountFactory(type=Account.Type.EXPENSE, code="9502", name="Utilities")
    payment_account = AccountFactory(type=Account.Type.ASSET, code="9503", name="Bank")

    response = api_client.post(
        "/api/v1/admin/accounting/expenses/",
        {
            "expense_date": "2026-01-15",
            "payee": "City Power Co",
            "description": "January electricity bill",
            "amount": "150.00",
            "expense_account_id": str(expense_account.id),
            "payment_account_id": str(payment_account.id),
            "reference_number": "INV-001",
        },
        format="json",
    )

    assert response.status_code == 201
    data = response.data["data"]
    assert data["payee"] == "City Power Co"
    assert data["journal_entry_id"] is not None

    entry_response = api_client.get(
        f"/api/v1/admin/accounting/journal-entries/{data['journal_entry_id']}/"
    )
    assert entry_response.status_code == 200
    lines = entry_response.data["data"]["lines"]
    assert len(lines) == 2
    total_debit = sum(float(line["debit"]) for line in lines)
    total_credit = sum(float(line["credit"]) for line in lines)
    assert total_debit == total_credit == 150.0


def test_admin_can_list_and_filter_expenses(api_client):
    admin = create_user(email="expense-admin-list@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    matching_account = AccountFactory(type=Account.Type.EXPENSE, code="9504")
    other_account = AccountFactory(type=Account.Type.EXPENSE, code="9505")
    ExpenseFactory(expense_account=matching_account, expense_date="2026-02-01")
    ExpenseFactory(expense_account=other_account, expense_date="2026-02-01")

    response = api_client.get(
        "/api/v1/admin/accounting/expenses/", {"account_id": str(matching_account.id)}
    )

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1


def test_rejects_non_expense_account_as_expense_account(api_client):
    admin = create_user(email="expense-admin-bad@example.com", role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    non_expense_account = AccountFactory(type=Account.Type.ASSET, code="9506")
    payment_account = AccountFactory(type=Account.Type.ASSET, code="9507")

    response = api_client.post(
        "/api/v1/admin/accounting/expenses/",
        {
            "expense_date": "2026-01-15",
            "payee": "Vendor",
            "amount": "50.00",
            "expense_account_id": str(non_expense_account.id),
            "payment_account_id": str(payment_account.id),
        },
        format="json",
    )

    assert response.status_code == 400
