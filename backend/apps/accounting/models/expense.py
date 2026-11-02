from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel

from .account import Account
from .expense_category import ExpenseCategory
from .journal_entry import JournalEntry


class Expense(FullAuditModel):
    expense_date = models.DateField()
    payee = models.CharField(max_length=150)
    description = models.CharField(max_length=255, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    expense_account = models.ForeignKey(Account, on_delete=models.PROTECT, related_name="expenses")
    # Simple mode's face of `expense_account`; never a replacement for it, the
    # ledger still needs the account.
    category = models.ForeignKey(
        ExpenseCategory, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses"
    )
    payment_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="expense_payments"
    )
    reference_number = models.CharField(max_length=50, blank=True)
    # Blank means the whole business (rent, salaries); the journal entry carries the same value.
    kind = models.CharField(
        max_length=10, choices=JournalEntry.Kind.choices, blank=True, default=""
    )
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.PROTECT, null=True, blank=True, related_name="expenses"
    )

    class Meta:
        ordering: ClassVar[list] = ["-expense_date"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "expense_date"], name="exp_expense_del_date_idx"),
            models.Index(fields=["deleted_at", "expense_account"], name="exp_expense_del_acct_idx"),
            models.Index(fields=["deleted_at", "category"], name="exp_expense_del_cat_idx"),
        ]
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(amount__gte=0),
                name="expense_amount_non_negative",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.payee} — {self.amount}"
