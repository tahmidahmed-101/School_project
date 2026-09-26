from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal


def format_currency(amount: Decimal | float | int, *, currency: str = "USD") -> str:
    """Format a plain, locale-independent currency string, e.g. "USD 1,234.50".

    Intentionally avoids Python's `locale` module (process-global state that's
    unsafe to mutate per-request in a web server) and any external i18n
    dependency; swap in `babel`/`django.utils.numberformat` if you need
    locale-aware formatting in a specific project.
    """
    return f"{currency} {Decimal(amount):,.2f}"


def format_date(value: date | datetime, fmt: str = "%Y-%m-%d") -> str:
    return value.strftime(fmt)
