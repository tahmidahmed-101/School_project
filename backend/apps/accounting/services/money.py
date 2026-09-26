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


def allocate(total: Decimal, weights: list[int]) -> list[Decimal]:
    """Split `total` across `weights` in proportion, to the cent, such that the
    parts sum back to exactly `total`.

    Naively prorating and rounding each share loses or gains fractions of a
    cent; the largest-remainder pass here hands those leftover cents to the
    shares that were rounded down hardest, so no money is invented or lost.
    """
    total = quantize_money(total)
    weight_total = sum(weights)
    if weight_total <= 0:
        return [Decimal("0") for _ in weights]

    exact = [total * Decimal(weight) / Decimal(weight_total) for weight in weights]
    shares = [value.quantize(CENTS, rounding="ROUND_DOWN") for value in exact]
    remainder_cents = int(((total - sum(shares)) / CENTS).to_integral_value())

    # Hand out the leftover cents to the largest fractional remainders first.
    order = sorted(range(len(weights)), key=lambda i: (exact[i] - shares[i]), reverse=True)
    for index in order[:remainder_cents]:
        shares[index] += CENTS
    return shares
