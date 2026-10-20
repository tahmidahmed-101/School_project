from __future__ import annotations

import csv
from decimal import Decimal

import pytest

from apps.accounting.factories import (
    AccountFactory,
    ExpenseFactory,
    JournalEntryLineFactory,
    TaxRateFactory,
)
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.accounting.services.expenses import _post_expense
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

ACCOUNTS_URL = "/api/v1/admin/accounting/accounts/"
EXPENSES_URL = "/api/v1/admin/accounting/expenses/"
TAX_RATES_URL = "/api/v1/admin/accounting/tax-rates/"


def _posted_expense():
    expense = ExpenseFactory()
    expense.journal_entry = _post_expense(expense)
    expense.save(update_fields=["journal_entry"])
    return expense


def _expense_balance(expense) -> Decimal:
    """Net debit the expense account carries for this expense."""
    lines = JournalEntryLine.objects.filter(
        account=expense.expense_account,
        journal_entry__reference_type="expense",
        journal_entry__reference_id=expense.id,
    )
    return sum((line.debit - line.credit for line in lines), Decimal("0"))


@pytest.fixture
def admin_client(api_client):
    api_client.force_authenticate(
        user=create_user(email="acct-crud@example.com", role=UserRole.ADMIN)
    )
    return api_client


@pytest.fixture
def view_only_client(api_client):
    staff = create_user(email="acct-crud-view@example.com", role=UserRole.STAFF)
    grantor = create_user(email="acct-crud-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ACCOUNTING_VIEW,
        is_enabled=True,
        granted_by=grantor,
    )
    api_client.force_authenticate(user=staff)
    return api_client


def _csv_rows(response):
    return list(csv.reader(response.content.decode("utf-8").splitlines()))


def test_delete_account_soft_deletes_it(admin_client):
    account = AccountFactory()

    response = admin_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    assert response.status_code == 204
    account.refresh_from_db()
    assert account.deleted_at is not None
    assert admin_client.get(f"{ACCOUNTS_URL}{account.id}/").status_code == 404


def test_delete_missing_account_returns_404(admin_client):
    response = admin_client.delete(f"{ACCOUNTS_URL}00000000-0000-0000-0000-000000000000/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "account_not_found"


def test_view_only_staff_cannot_delete_account(view_only_client):
    account = AccountFactory()

    response = view_only_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    assert response.status_code == 403


def test_delete_account_with_journal_lines_conflicts(admin_client):
    account = AccountFactory()
    JournalEntryLineFactory(account=account, debit=Decimal("5"))

    response = admin_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "account_in_use"


def test_delete_parent_account_conflicts(admin_client):
    parent = AccountFactory()
    AccountFactory(parent=parent)

    response = admin_client.delete(f"{ACCOUNTS_URL}{parent.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "account_in_use"


def test_delete_account_referenced_by_expense_conflicts(admin_client):
    account = AccountFactory(type=Account.Type.EXPENSE)
    ExpenseFactory(expense_account=account)

    response = admin_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    assert response.status_code == 409
    assert response.data["error"]["code"] == "account_in_use"


def test_restore_account(admin_client):
    account = AccountFactory()
    admin_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    response = admin_client.post(f"{ACCOUNTS_URL}{account.id}/restore/")

    assert response.status_code == 200
    account.refresh_from_db()
    assert account.deleted_at is None


def test_restore_account_that_is_not_deleted_fails(admin_client):
    account = AccountFactory()

    response = admin_client.post(f"{ACCOUNTS_URL}{account.id}/restore/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "not_deleted"


def test_restore_missing_account_returns_404(admin_client):
    response = admin_client.post(f"{ACCOUNTS_URL}00000000-0000-0000-0000-000000000000/restore/")

    assert response.status_code == 404


def test_account_list_include_deleted(admin_client):
    account = AccountFactory()
    admin_client.delete(f"{ACCOUNTS_URL}{account.id}/")

    assert admin_client.get(ACCOUNTS_URL).data["data"]["count"] == 0
    assert admin_client.get(ACCOUNTS_URL, {"include_deleted": "true"}).data["data"]["count"] == 1


def test_include_deleted_requires_post_permission(view_only_client):
    assert view_only_client.get(ACCOUNTS_URL).status_code == 200
    assert view_only_client.get(ACCOUNTS_URL, {"include_deleted": "true"}).status_code == 403


def test_delete_unposted_expense(admin_client):
    expense = ExpenseFactory()

    response = admin_client.delete(f"{EXPENSES_URL}{expense.id}/")

    assert response.status_code == 204
    expense.refresh_from_db()
    assert expense.deleted_at is not None


def test_delete_posted_expense_reverses_it_out_of_the_ledger(admin_client):
    expense = _posted_expense()
    entry = expense.journal_entry

    response = admin_client.delete(f"{EXPENSES_URL}{expense.id}/")

    assert response.status_code == 204
    expense.refresh_from_db()
    assert expense.deleted_at is not None
    entry.refresh_from_db()
    assert entry.status == JournalEntry.Status.POSTED
    reversal = JournalEntry.objects.get(reverses=entry)
    assert _expense_balance(expense) == Decimal("0")
    assert reversal.reference_id == expense.id


def test_restoring_a_deleted_expense_books_it_again(admin_client):
    expense = _posted_expense()
    original = expense.journal_entry
    admin_client.delete(f"{EXPENSES_URL}{expense.id}/")

    response = admin_client.post(f"{EXPENSES_URL}{expense.id}/restore/")

    assert response.status_code == 200
    expense.refresh_from_db()
    assert expense.deleted_at is None
    assert expense.journal_entry_id != original.id
    assert _expense_balance(expense) == expense.amount


def test_delete_missing_expense_returns_404(admin_client):
    response = admin_client.delete(f"{EXPENSES_URL}00000000-0000-0000-0000-000000000000/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "expense_not_found"


def test_view_only_staff_cannot_delete_expense(view_only_client):
    expense = ExpenseFactory()

    assert view_only_client.delete(f"{EXPENSES_URL}{expense.id}/").status_code == 403


def test_restore_expense_and_include_deleted(admin_client):
    expense = ExpenseFactory()
    admin_client.delete(f"{EXPENSES_URL}{expense.id}/")

    assert admin_client.get(EXPENSES_URL).data["data"]["count"] == 0
    assert admin_client.get(EXPENSES_URL, {"include_deleted": "true"}).data["data"]["count"] == 1

    response = admin_client.post(f"{EXPENSES_URL}{expense.id}/restore/")

    assert response.status_code == 200
    expense.refresh_from_db()
    assert expense.deleted_at is None


def test_delete_and_restore_tax_rate(admin_client):
    tax_rate = TaxRateFactory()

    assert admin_client.delete(f"{TAX_RATES_URL}{tax_rate.id}/").status_code == 204
    tax_rate.refresh_from_db()
    assert tax_rate.deleted_at is not None

    assert admin_client.get(TAX_RATES_URL).data["data"]["count"] == 0
    assert admin_client.get(TAX_RATES_URL, {"include_deleted": "true"}).data["data"]["count"] == 1

    response = admin_client.post(f"{TAX_RATES_URL}{tax_rate.id}/restore/")

    assert response.status_code == 200
    tax_rate.refresh_from_db()
    assert tax_rate.deleted_at is None


def test_delete_missing_tax_rate_returns_404(admin_client):
    response = admin_client.delete(f"{TAX_RATES_URL}00000000-0000-0000-0000-000000000000/")

    assert response.status_code == 404
    assert response.data["error"]["code"] == "tax_rate_not_found"


def test_view_only_staff_cannot_delete_tax_rate(view_only_client):
    tax_rate = TaxRateFactory()

    assert view_only_client.delete(f"{TAX_RATES_URL}{tax_rate.id}/").status_code == 403


def test_profit_and_loss_csv_export(view_only_client):
    response = view_only_client.get(
        "/api/v1/admin/accounting/reports/profit-and-loss/",
        {"start": "2026-01-01", "end": "2026-12-31", "file_format": "csv"},
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    rows = _csv_rows(response)
    assert rows[0] == ["line_item", "amount"]
    assert rows[1][0] == "revenue"


def test_balance_sheet_csv_export(view_only_client):
    response = view_only_client.get(
        "/api/v1/admin/accounting/reports/balance-sheet/",
        {"as_of": "2026-12-31", "file_format": "csv"},
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert _csv_rows(response)[0] == ["line_item", "amount"]


def test_cash_flow_csv_export(view_only_client):
    response = view_only_client.get(
        "/api/v1/admin/accounting/reports/cash-flow/",
        {"start": "2026-01-01", "end": "2026-12-31", "file_format": "csv"},
    )

    assert response.status_code == 200
    assert response["Content-Type"] == "text/csv"
    assert _csv_rows(response)[0] == ["line_item", "amount"]


def test_reports_still_return_json_without_file_format(view_only_client):
    response = view_only_client.get(
        "/api/v1/admin/accounting/reports/cash-flow/",
        {"start": "2026-01-01", "end": "2026-12-31"},
    )

    assert response.status_code == 200
    assert "net_change_in_cash" in response.data["data"]


def test_report_rejects_unknown_file_format(view_only_client):
    response = view_only_client.get(
        "/api/v1/admin/accounting/reports/cash-flow/",
        {"start": "2026-01-01", "end": "2026-12-31", "file_format": "pdf"},
    )

    assert response.status_code == 400


def test_report_csv_requires_view_permission(api_client):
    api_client.force_authenticate(
        user=create_user(email="acct-nobody@example.com", role=UserRole.STAFF)
    )

    response = api_client.get(
        "/api/v1/admin/accounting/reports/cash-flow/",
        {"start": "2026-01-01", "end": "2026-12-31", "file_format": "csv"},
    )

    assert response.status_code == 403
