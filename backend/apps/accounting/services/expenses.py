from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.accounting.models import Account, Expense, ExpenseCategory, JournalEntry
from apps.accounting.services.journal import is_reversed, post_journal_entry, reverse_journal_entry
from apps.business.constants import ModuleKey
from apps.business.selectors.modules import is_feature_enabled
from apps.business.services.modules import require_feature
from apps.common.exceptions import BusinessRuleViolationError
from apps.common.services.soft_delete import soft_delete_instance

CHART_OF_ACCOUNTS_PICKER = "chart_of_accounts_picker"


def uncategorised_expenses_in_use() -> str | None:
    """Simple mode never shows the chart of accounts, so an expense booked to an
    account no category maps to would have nothing to display."""
    mapped = ExpenseCategory.objects.filter(deleted_at__isnull=True).values("expense_account_id")
    count = (
        Expense.objects.filter(deleted_at__isnull=True, category__isnull=True)
        .exclude(expense_account_id__in=mapped)
        .count()
    )
    if count:
        return (
            f"{count} expenses are booked to an account no category maps to. "
            "Add matching categories first."
        )
    return None


def resolve_expense_account(
    *, expense_account: Account | None, category: ExpenseCategory | None
) -> Account:
    if not is_feature_enabled(ModuleKey.ACCOUNTING, CHART_OF_ACCOUNTS_PICKER):
        if expense_account is not None:
            require_feature(ModuleKey.ACCOUNTING, CHART_OF_ACCOUNTS_PICKER)
        if category is None:
            raise BusinessRuleViolationError(
                "Pick an expense category.", code="expense_category_required"
            )
    if expense_account is None and category is not None:
        expense_account = category.expense_account
    if expense_account is None:
        raise BusinessRuleViolationError(
            "Pick an expense account.", code="expense_account_required"
        )
    return expense_account


@transaction.atomic
def create_expense(
    *,
    expense_date: date,
    payee: str,
    amount: Decimal,
    payment_account: Account,
    expense_account: Account | None = None,
    category: ExpenseCategory | None = None,
    description: str = "",
    reference_number: str = "",
    kind: str = "",
) -> Expense:
    expense_account = resolve_expense_account(expense_account=expense_account, category=category)
    expense = Expense.objects.create(
        expense_date=expense_date,
        payee=payee,
        description=description,
        amount=amount,
        expense_account=expense_account,
        category=category,
        payment_account=payment_account,
        reference_number=reference_number,
        kind=kind,
    )
    expense.journal_entry = _post_expense(expense)
    expense.save(update_fields=["journal_entry"])
    return expense


def _post_expense(expense: Expense) -> JournalEntry:
    reference = f" ({expense.reference_number})" if expense.reference_number else ""
    return post_journal_entry(
        entry_date=expense.expense_date,
        reference_type="expense",
        reference_id=expense.id,
        description=f"Expense: {expense.payee}{reference}",
        kind=expense.kind,
        lines=[
            {"account": expense.expense_account, "debit": expense.amount, "credit": Decimal("0")},
            {"account": expense.payment_account, "debit": Decimal("0"), "credit": expense.amount},
        ],
    )


def _move_expense_to_kind(expense: Expense, kind: str) -> None:
    """A posted entry is never edited, so the old one is reversed on its own date
    (each half's report nets to zero in that period) and a new one posted."""
    entry = expense.journal_entry if expense.journal_entry_id is not None else None
    expense.kind = kind
    if entry is None:
        return
    if is_reversed(entry):
        raise BusinessRuleViolationError(
            "This expense's journal entry was reversed; record a new expense instead.",
            code="expense_reversed",
        )
    reverse_journal_entry(entry, entry_date=entry.entry_date, reason="moved to another half")
    expense.journal_entry = _post_expense(expense)


@transaction.atomic
def update_expense(*, expense: Expense, data: dict) -> Expense:
    # amount/date/accounts are excluded: changing them without reposting
    # would desync the expense from its already-posted journal entry.
    allowed_fields = {"payee", "description", "reference_number"}
    update_fields = [field for field in data if field in allowed_fields]
    for field in update_fields:
        setattr(expense, field, data[field])
    if "kind" in data and data["kind"] != expense.kind:
        _move_expense_to_kind(expense, data["kind"])
        update_fields += ["kind", "journal_entry"]
    if update_fields:
        expense.save(update_fields=update_fields)
    return expense


@transaction.atomic
def delete_expense(*, expense: Expense, actor=None) -> Expense:
    # Same reason `update_expense` freezes amount/date/accounts: the posted
    # entry is the ledger, so removal has to go through a reversing entry.
    entry = expense.journal_entry if expense.journal_entry_id is not None else None
    if entry is not None and entry.status == JournalEntry.Status.POSTED:
        raise BusinessRuleViolationError(
            "This expense is posted to the ledger; reverse the journal entry instead.",
            code="expense_posted",
        )
    return soft_delete_instance(expense, actor=actor, code="expense_in_use")
