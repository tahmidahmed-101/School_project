from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from apps.accounting.factories import AccountFactory
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.accounting.services.journal import post_journal_entry, reverse_journal_entry
from apps.common.exceptions import BusinessRuleViolationError

pytestmark = pytest.mark.django_db


def test_post_journal_entry_rejects_unbalanced_lines():
    inventory = AccountFactory(code="8000", type=Account.Type.ASSET)
    grni = AccountFactory(code="8001", type=Account.Type.LIABILITY)

    with pytest.raises(BusinessRuleViolationError):
        post_journal_entry(
            entry_date=date.today(),
            lines=[
                {"account": inventory, "debit": Decimal("100"), "credit": Decimal("0")},
                {"account": grni, "debit": Decimal("0"), "credit": Decimal("90")},
            ],
        )


def test_post_journal_entry_rejects_empty_lines():
    with pytest.raises(BusinessRuleViolationError):
        post_journal_entry(entry_date=date.today(), lines=[])


def test_post_journal_entry_creates_posted_entry_with_matching_lines():
    inventory = AccountFactory(code="8002", type=Account.Type.ASSET)
    grni = AccountFactory(code="8003", type=Account.Type.LIABILITY)

    entry = post_journal_entry(
        entry_date=date.today(),
        reference_type="test",
        lines=[
            {"account": inventory, "debit": Decimal("100"), "credit": Decimal("0")},
            {"account": grni, "debit": Decimal("0"), "credit": Decimal("100")},
        ],
    )

    assert entry.status == "posted"
    assert entry.lines.count() == 2
    total_debit = sum(line.debit for line in entry.lines.all())
    total_credit = sum(line.credit for line in entry.lines.all())
    assert total_debit == total_credit == Decimal("100")


def _entry(code_a="8100", code_b="8101", amount=Decimal("100")):
    debit_account = AccountFactory(code=code_a, type=Account.Type.ASSET)
    credit_account = AccountFactory(code=code_b, type=Account.Type.LIABILITY)
    return post_journal_entry(
        entry_date=date.today(),
        reference_type="test",
        description="Original posting",
        lines=[
            {"account": debit_account, "debit": amount, "credit": Decimal("0")},
            {"account": credit_account, "debit": Decimal("0"), "credit": amount},
        ],
    )


def test_reverse_journal_entry_swaps_debits_and_credits():
    original = _entry("8110", "8111")

    reversal = reverse_journal_entry(original)

    assert reversal.id != original.id
    assert reversal.reverses_id == original.id
    assert reversal.status == JournalEntry.Status.POSTED
    original_by_account = {
        line.account_id: (line.debit, line.credit) for line in original.lines.all()
    }
    for line in reversal.lines.all():
        debit, credit = original_by_account[line.account_id]
        assert (line.debit, line.credit) == (credit, debit)


def test_reverse_journal_entry_keeps_the_books_balanced():
    original = _entry("8120", "8121", Decimal("250.50"))

    reverse_journal_entry(original)

    lines = JournalEntryLine.objects.all()
    assert sum(line.debit for line in lines) == sum(line.credit for line in lines)
    net = sum(line.debit - line.credit for line in lines)
    assert net == Decimal("0")


def test_reverse_journal_entry_leaves_the_original_intact():
    original = _entry("8130", "8131")
    before = [(line.account_id, line.debit, line.credit) for line in original.lines.order_by("id")]

    reverse_journal_entry(original)

    original.refresh_from_db()
    assert original.status == JournalEntry.Status.POSTED
    assert original.deleted_at is None
    assert original.description == "Original posting"
    after = [(line.account_id, line.debit, line.credit) for line in original.lines.order_by("id")]
    assert after == before


def test_reverse_journal_entry_refuses_double_reversal():
    original = _entry("8140", "8141")
    reverse_journal_entry(original)

    with pytest.raises(BusinessRuleViolationError) as exc:
        reverse_journal_entry(original)
    assert exc.value.code == "already_reversed"


def test_reverse_journal_entry_records_the_reason_in_the_description():
    original = _entry("8150", "8151")

    reversal = reverse_journal_entry(original, reason="Keyed twice")

    assert "Reversal of Original posting" in reversal.description
    assert "Keyed twice" in reversal.description


def test_reverse_journal_entry_never_predates_the_original():
    inventory = AccountFactory(code="8160", type=Account.Type.ASSET)
    grni = AccountFactory(code="8161", type=Account.Type.LIABILITY)
    future = date.today() + timedelta(days=30)
    original = post_journal_entry(
        entry_date=future,
        lines=[
            {"account": inventory, "debit": Decimal("10"), "credit": Decimal("0")},
            {"account": grni, "debit": Decimal("0"), "credit": Decimal("10")},
        ],
    )

    assert reverse_journal_entry(original).entry_date == future


def test_reverse_journal_entry_refuses_a_deleted_entry():
    original = _entry("8170", "8171")
    original.soft_delete()

    with pytest.raises(BusinessRuleViolationError) as exc:
        reverse_journal_entry(original)
    assert exc.value.code == "entry_deleted"


def test_a_reversal_can_itself_be_reversed():
    original = _entry("8180", "8181")
    reversal = reverse_journal_entry(original)

    second = reverse_journal_entry(reversal)

    assert second.reverses_id == reversal.id
    lines = JournalEntryLine.objects.all()
    assert sum(line.debit for line in lines) == sum(line.credit for line in lines)
