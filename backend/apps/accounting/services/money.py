from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")


def quantize_money(amount: Decimal) -> Decimal:
    """Round to the 2 decimal places every money column in the schema stores.

    Journal amounts must be quantized *before* `post_journal_entry` runs its
    debit == credit check. Otherwise the check passes at full Decimal
    precision and the database rounds each line independently on write, which
    can leave a posted entry off by a cent — a balance the ledger has no way
    to correct afterwards, since entries are immutable once posted.
    """
    return Decimal(amount).quantize(CENTS, rounding=ROUND_HALF_UP)
