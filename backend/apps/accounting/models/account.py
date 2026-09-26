from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel


class Account(FullAuditModel):
    class Type(models.TextChoices):
        ASSET = "asset", "Asset"
        LIABILITY = "liability", "Liability"
        EQUITY = "equity", "Equity"
        REVENUE = "revenue", "Revenue"
        EXPENSE = "expense", "Expense"

    code: models.CharField = models.CharField(max_length=20, unique=True)
    name: models.CharField = models.CharField(max_length=150)
    type: models.CharField = models.CharField(max_length=20, choices=Type.choices)
    parent: models.ForeignKey | None = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="children"
    )

    class Meta:
        ordering: ClassVar[list] = ["code"]
        indexes: ClassVar[list] = [
            models.Index(fields=["deleted_at", "type"], name="acct_account_del_type_idx")
        ]

    def __str__(self) -> str:
        return f"{self.code} {self.name}"
