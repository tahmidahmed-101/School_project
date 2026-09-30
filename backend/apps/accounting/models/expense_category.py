from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel

from .account import Account


class ExpenseCategory(FullAuditModel):
    """Simple-mode face of the chart of accounts: a flat named list that resolves
    to a real ledger account so the books still balance."""

    name = models.CharField(max_length=100)
    description = models.CharField(max_length=255, blank=True)
    expense_account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="expense_categories"
    )

    class Meta:
        ordering: ClassVar[list] = ["name"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "name"], name="expcat_del_name_idx")
        ]
        constraints: ClassVar[list] = [
            models.UniqueConstraint(
                fields=["name"],
                condition=models.Q(deleted_at__isnull=True),
                name="uniq_expense_category_name",
            ),
        ]

    def __str__(self) -> str:
        return self.name
