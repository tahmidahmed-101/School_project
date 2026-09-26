from __future__ import annotations

from decimal import Decimal
from uuid import UUID

from django.db import transaction
from django.utils import timezone

from apps.accounting.models import JournalEntry, JournalEntryLine
from apps.common.exceptions import BusinessRuleViolationError


@transaction.atomic
def post_journal_entry(
    *,
    entry_date,
    lines: list[dict],
    reference_type: str = "",
    reference_id: UUID | None = None,
    description: str = "",
) -> JournalEntry:
    """The single writer for the ledger — every posting function in
    `services/postings.py` funnels through this, exactly like
    `apps.inventory.services.stock.record_movement` is the only writer to
    stock. A `JournalEntry` is only ever created already `posted`; nothing
    edits it after (see `JournalEntryAdmin` in `apps/accounting/admin.py`).
    """
    if not lines:
        raise BusinessRuleViolationError(
            "A journal entry needs at least one line.", code="no_lines"
        )

    total_debit = sum((line.get("debit", Decimal("0")) for line in lines), Decimal("0"))
    total_credit = sum((line.get("credit", Decimal("0")) for line in lines), Decimal("0"))
    if total_debit != total_credit:
        raise BusinessRuleViolationError("Debits must equal credits.", code="unbalanced_entry")

    entry = JournalEntry.objects.create(
        entry_date=entry_date,
        reference_type=reference_type,
        reference_id=reference_id,
        status=JournalEntry.Status.POSTED,
        description=description,
    )
    JournalEntryLine.objects.bulk_create(
        [
            JournalEntryLine(
                journal_entry=entry,
                account=line["account"],
                debit=line.get("debit", Decimal("0")),
                credit=line.get("credit", Decimal("0")),
            )
            for line in lines
        ]
    )
    return entry


def is_reversed(entry: JournalEntry) -> bool:
    return entry.reversals.filter(deleted_at__isnull=True).exists()


@transaction.atomic
def reverse_journal_entry(
    entry: JournalEntry,
    *,
    entry_date=None,
    reason: str = "",
) -> JournalEntry:
    """Post the contra of `entry` — same accounts, debits and credits swapped.

    The original is never touched: a posted entry is a historical fact, and the
    audit trail has to show both the mistake and its correction.
    """
    if entry.deleted_at is not None:
        raise BusinessRuleViolationError(
            "This journal entry has been deleted.", code="entry_deleted"
        )
    if entry.status != JournalEntry.Status.POSTED:
        raise BusinessRuleViolationError(
            "Only a posted journal entry can be reversed.", code="entry_not_posted"
        )
    if is_reversed(entry):
        raise BusinessRuleViolationError(
            "This journal entry has already been reversed.", code="already_reversed"
        )

    original_lines = list(entry.lines.select_related("account"))
    if not original_lines:
        raise BusinessRuleViolationError(
            "This journal entry has no lines to reverse.", code="no_lines"
        )

    # A reversal can never predate what it reverses, so a back-dated original
    # pins the reversal to its own date rather than today's.
    entry_date = entry_date or max(timezone.now().date(), entry.entry_date)

    description = f"Reversal of {entry.description or entry}"
    if reason:
        description = f"{description} — {reason}"

    reversal = post_journal_entry(
        entry_date=entry_date,
        reference_type=entry.reference_type,
        reference_id=entry.reference_id,
        description=description[:255],
        lines=[
            {"account": line.account, "debit": line.credit, "credit": line.debit}
            for line in original_lines
        ],
    )
    reversal.reverses = entry
    reversal.save(update_fields=["reverses", "updated_at"])
    return reversal
