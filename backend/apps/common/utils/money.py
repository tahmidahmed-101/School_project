"""The one place rounding happens. ROUND_HALF_UP, applied once."""

from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def _exact(value: Decimal | int | str) -> Decimal:
    if isinstance(value, float):
        raise TypeError("Money is never a float; pass a Decimal or a decimal string.")
    return Decimal(str(value))


def quantize(value: Decimal | int | str) -> Decimal:
    return _exact(value).quantize(CENT, rounding=ROUND_HALF_UP)


def quantize_down(value: Decimal | int | str) -> Decimal:
    """ROUND_DOWN to cents. Only for splits that must not exceed their total
    (installment lines). A value from here is never re-quantized."""
    return _exact(value).quantize(CENT, rounding=ROUND_DOWN)


def group_lakh(value: Decimal | int | str) -> str:
    """1,23,45,678.50 — the lakh/crore grouping the web's `money()` prints."""
    rounded = quantize(value)
    sign = "-" if rounded < 0 else ""
    whole, cents = str(abs(rounded)).split(".")
    head, tail = whole[:-3], whole[-3:]
    groups = [head[max(end - 2, 0) : end] for end in range(len(head), 0, -2)][::-1]
    return f"{sign}{','.join([*groups, tail])}.{cents}"


def percent_of(amount: Decimal, pct: Decimal) -> Decimal:
    """A percentage of an amount, deliberately **not** quantized.

    Always wrap it: `quantize(percent_of(base, pct))`. It does not round itself
    because rounding here would round once per term, so a caller that sums
    several of these would round twice — the exact double-rounding this system's
    round-once rule exists to prevent. An unquantized Decimal assigned to a
    (14,2) column is rounded half-even by Postgres, outside our rule entirely,
    so the wrap is not optional.
    """
    return Decimal(amount) * Decimal(pct) / Decimal("100")
