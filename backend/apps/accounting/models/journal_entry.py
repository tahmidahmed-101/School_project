from __future__ import annotations

from typing import ClassVar

from django.db import models

from apps.common.models import FullAuditModel, TimeStampedModel

from .account import Account


class JournalEntry(FullAuditModel):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        POSTED = "posted", "Posted"

    class Kind(models.TextChoices):
        STOCK = "stock", "Stock"
        PREORDER = "preorder", "Pre-order"

    entry_date = models.DateField()
    reference_type = models.CharField(max_length=50, blank=True)
    reference_id = models.UUIDField(null=True, blank=True)
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.DRAFT
    )
    description = models.CharField(max_length=255, blank=True)
    # Blank means company-wide (rent, salaries, capital): never guessed into a half.
    kind = models.CharField(max_length=10, choices=Kind.choices, blank=True, default="")
    reverses = models.ForeignKey(
        "self", on_delete=models.PROTECT, null=True, blank=True, related_name="reversals"
    )

    class Meta:
        ordering: ClassVar[list] = ["-entry_date"]
        indexes: ClassVar[list] = [
            models.Index(fields=["reference_type", "reference_id"]),
            models.Index(fields=["status", "entry_date"]),
            models.Index(fields=["deleted_at", "entry_date"], name="je_deleted_date_idx"),
            models.Index(fields=["kind", "entry_date"], name="je_kind_date_idx"),
        ]

    def __str__(self) -> str:
        return f"JE-{self.id} ({self.status})"


class JournalEntryLine(TimeStampedModel):
    journal_entry = models.ForeignKey(
        JournalEntry, on_delete=models.CASCADE, related_name="lines"
    )
    account = models.ForeignKey(
        Account, on_delete=models.PROTECT, related_name="lines"
    )
    debit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit = models.DecimalField(max_digits=14, decimal_places=2, default=0)

    class Meta:
        constraints: ClassVar[list] = [
            models.CheckConstraint(
                condition=models.Q(debit__gte=0) & models.Q(credit__gte=0),
                name="jeline_amounts_non_negative",
            ),
            # A line is one side or the other; posted entries are immutable, so a
            # two-sided line can never be corrected in place.
            models.CheckConstraint(
                condition=models.Q(debit=0) | models.Q(credit=0),
                name="jeline_single_sided",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.account.code}: D{self.debit}/C{self.credit}"
