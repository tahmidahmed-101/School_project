from __future__ import annotations

import pytest

from apps.accounting.factories import AccountFactory, ExpenseCategoryFactory
from apps.accounting.models import Account
from apps.accounts.constants import StaffPermissionCode, UserRole
from apps.accounts.services.staff_permissions import set_staff_permission
from apps.accounts.tests.helpers import create_user

pytestmark = pytest.mark.django_db

LIST_URL = "/api/v1/admin/accounting/expense-categories/"


def _admin(api_client, email):
    admin = create_user(email=email, role=UserRole.ADMIN)
    api_client.force_authenticate(user=admin)
    return admin


def test_staff_without_permission_cannot_view_categories(api_client):
    staff = create_user(email="cat-staff@example.com", role=UserRole.STAFF)
    api_client.force_authenticate(user=staff)

    assert api_client.get(LIST_URL).status_code == 403


def test_staff_without_post_permission_cannot_create_a_category(api_client):
    staff = create_user(email="cat-staff-view@example.com", role=UserRole.STAFF)
    grantor = create_user(email="cat-grantor@example.com", role=UserRole.ADMIN)
    set_staff_permission(
        staff_user=staff,
        permission_code=StaffPermissionCode.ACCOUNTING_VIEW,
        is_enabled=True,
        granted_by=grantor,
    )
    api_client.force_authenticate(user=staff)
    account = AccountFactory(type=Account.Type.EXPENSE, code="9600")

    response = api_client.post(
        LIST_URL, {"name": "Rent", "expense_account_id": str(account.id)}, format="json"
    )

    assert response.status_code == 403


def test_admin_can_create_and_list_categories(api_client):
    _admin(api_client, "cat-admin@example.com")
    account = AccountFactory(type=Account.Type.EXPENSE, code="9601")

    created = api_client.post(
        LIST_URL,
        {"name": "Rent", "description": "Premises", "expense_account_id": str(account.id)},
        format="json",
    )

    assert created.status_code == 201
    assert created.data["data"]["name"] == "Rent"
    assert str(created.data["data"]["expense_account_id"]) == str(account.id)

    listed = api_client.get(LIST_URL)
    assert listed.status_code == 200
    assert listed.data["data"]["count"] == 1


def test_category_rejects_a_non_expense_account(api_client):
    _admin(api_client, "cat-admin-bad@example.com")
    account = AccountFactory(type=Account.Type.ASSET, code="9602")

    response = api_client.post(
        LIST_URL, {"name": "Rent", "expense_account_id": str(account.id)}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "expense_account_not_found"


def test_category_rejects_a_duplicate_name(api_client):
    _admin(api_client, "cat-admin-dupe@example.com")
    ExpenseCategoryFactory(name="Rent")
    account = AccountFactory(type=Account.Type.EXPENSE, code="9603")

    response = api_client.post(
        LIST_URL, {"name": "rent", "expense_account_id": str(account.id)}, format="json"
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "category_name_taken"


def test_admin_can_rename_a_category(api_client):
    _admin(api_client, "cat-admin-patch@example.com")
    category = ExpenseCategoryFactory(name="Rent")

    response = api_client.patch(f"{LIST_URL}{category.id}/", {"name": "Premises"}, format="json")

    assert response.status_code == 200
    assert response.data["data"]["name"] == "Premises"


def test_deleting_a_category_with_expenses_is_refused(api_client):
    from apps.accounting.factories import ExpenseFactory

    _admin(api_client, "cat-admin-delete@example.com")
    category = ExpenseCategoryFactory(name="Rent")
    ExpenseFactory(category=category, expense_account=category.expense_account)

    response = api_client.delete(f"{LIST_URL}{category.id}/")

    assert response.status_code == 400
    assert response.data["error"]["code"] == "expense_category_in_use"


def test_unused_category_can_be_deleted_and_restored(api_client):
    _admin(api_client, "cat-admin-restore@example.com")
    category = ExpenseCategoryFactory(name="Transport")

    assert api_client.delete(f"{LIST_URL}{category.id}/").status_code == 204
    assert api_client.get(LIST_URL).data["data"]["count"] == 0

    restored = api_client.post(f"{LIST_URL}{category.id}/restore/", {}, format="json")
    assert restored.status_code == 200
    assert api_client.get(LIST_URL).data["data"]["count"] == 1


def test_an_account_a_category_maps_to_cannot_be_deleted(api_client):
    _admin(api_client, "cat-admin-acct@example.com")
    category = ExpenseCategoryFactory(name="Utilities")

    response = api_client.delete(
        f"/api/v1/admin/accounting/accounts/{category.expense_account_id}/"
    )

    assert response.status_code == 409
    assert response.data["error"]["code"] == "account_in_use"


def test_expense_created_by_category_resolves_the_account(api_client):
    _admin(api_client, "cat-admin-expense@example.com")
    category = ExpenseCategoryFactory(name="Utilities")
    payment_account = AccountFactory(type=Account.Type.ASSET, code="9604")

    response = api_client.post(
        "/api/v1/admin/accounting/expenses/",
        {
            "expense_date": "2026-01-15",
            "payee": "City Power Co",
            "amount": "120.00",
            "category_id": str(category.id),
            "payment_account_id": str(payment_account.id),
        },
        format="json",
    )

    assert response.status_code == 201
    assert str(response.data["data"]["category_id"]) == str(category.id)
    assert str(response.data["data"]["expense_account_id"]) == str(category.expense_account_id)


def test_expense_without_account_or_category_is_refused(api_client):
    _admin(api_client, "cat-admin-neither@example.com")
    payment_account = AccountFactory(type=Account.Type.ASSET, code="9605")

    response = api_client.post(
        "/api/v1/admin/accounting/expenses/",
        {
            "expense_date": "2026-01-15",
            "payee": "City Power Co",
            "amount": "120.00",
            "payment_account_id": str(payment_account.id),
        },
        format="json",
    )

    assert response.status_code == 400
    assert response.data["error"]["code"] == "expense_account_required"


def test_expenses_can_be_filtered_by_category(api_client):
    from apps.accounting.factories import ExpenseFactory

    _admin(api_client, "cat-admin-filter@example.com")
    rent = ExpenseCategoryFactory(name="Rent")
    transport = ExpenseCategoryFactory(name="Transport")
    ExpenseFactory(category=rent, expense_account=rent.expense_account)
    ExpenseFactory(category=transport, expense_account=transport.expense_account)

    response = api_client.get("/api/v1/admin/accounting/expenses/", {"category_id": str(rent.id)})

    assert response.status_code == 200
    assert response.data["data"]["count"] == 1
