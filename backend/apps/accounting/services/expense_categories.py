from __future__ import annotations

from django.db import transaction

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account, ExpenseCategory
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.soft_delete import soft_delete_instance

EXPENSE_CATEGORY_PROTECTED_RELATIONS = ("expenses",)


def default_expense_account() -> Account:
    """Simple mode hides the chart of accounts, so a category created there has
    no account to name — it lands here and the ledger still balances."""
    account, _ = Account.objects.get_or_create(
        code=ACCOUNT_CODES["general_expense"],
        defaults={"name": "General Expense", "type": Account.Type.EXPENSE},
    )
    return account


def _reject_non_expense_account(account: Account) -> None:
    if account.type != Account.Type.EXPENSE:
        raise BusinessRuleViolationError(
            "A category must map to an expense account.", code="category_account_not_expense"
        )


def _reject_duplicate_name(name: str, *, exclude_pk=None) -> None:
    queryset = ExpenseCategory.objects.filter(name__iexact=name, deleted_at__isnull=True)
    if exclude_pk is not None:
        queryset = queryset.exclude(pk=exclude_pk)
    if queryset.exists():
        raise BusinessRuleViolationError(
            f"A category named {name} already exists.", code="category_name_taken"
        )


@transaction.atomic
def create_expense_category(
    *, name: str, expense_account: Account | None = None, description: str = ""
) -> ExpenseCategory:
    if expense_account is None:
        expense_account = default_expense_account()
    _reject_non_expense_account(expense_account)
    _reject_duplicate_name(name)
    return ExpenseCategory.objects.create(
        name=name, description=description, expense_account=expense_account
    )


@transaction.atomic
def update_expense_category(*, category: ExpenseCategory, data: dict) -> ExpenseCategory:
    if "expense_account" in data:
        _reject_non_expense_account(data["expense_account"])
    if "name" in data:
        _reject_duplicate_name(data["name"], exclude_pk=category.pk)
    allowed_fields = {"name", "description", "expense_account", "is_active"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(category, field, data[field])
    if update_fields:
        category.save(update_fields=update_fields)
    return category


@transaction.atomic
def delete_expense_category(*, category: ExpenseCategory, actor=None) -> ExpenseCategory:
    return soft_delete_instance(
        category,
        actor=actor,
        protected_relations=EXPENSE_CATEGORY_PROTECTED_RELATIONS,
        code="expense_category_in_use",
    )
