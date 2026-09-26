from __future__ import annotations

from decimal import Decimal, InvalidOperation

from django import template

register = template.Library()


def _decimal(value: object) -> Decimal | None:
    if value is None or value == "":
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None


@register.filter
def money(value: object, places: int = 2) -> str:
    """Grouped amount with the currency symbol, e.g. ৳1,234.50."""
    amount = _decimal(value)
    if amount is None:
        return "—"
    from apps.business.selectors import get_currency_symbol

    return f"{get_currency_symbol()}{amount:,.{places}f}"


@register.filter
def amount(value: object, places: int = 2) -> str:
    """Grouped amount without the symbol, for columns that carry it in the header."""
    parsed = _decimal(value)
    return "—" if parsed is None else f"{parsed:,.{places}f}"
