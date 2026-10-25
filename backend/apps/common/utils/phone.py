"""Bangladeshi mobile number normalisation.

The same number reaches checkout as ``01711223344``, ``+8801711223344`` or
``8801711223344``. Fraud/risk signals are keyed on the phone rather than on
the account (COD abuse follows the number), so every reader and writer of
that key must agree on one canonical form.
"""

from __future__ import annotations

import re

from django.core.exceptions import ValidationError

COUNTRY_CODE = "880"

# Operator prefixes actually assigned in Bangladesh: 013/017 Grameenphone,
# 014/019 Banglalink, 015 Teletalk, 016 Airtel, 018 Robi. 010-012 are not
# mobile prefixes, so a number carrying one is a typo rather than a real line.
BD_MOBILE = re.compile(r"^01[3-9]\d{8}$")

BD_MOBILE_HELP = "Enter a Bangladeshi mobile number, like 01712345678 or +8801712345678."


def digits(raw: str) -> str:
    return re.sub(r"\D", "", raw or "")


def local_bd_mobile(raw: str) -> str:
    """``01XXXXXXXXX`` where the input is recognisably a BD number.

    Lenient: strips the country code and restores the leading zero, but does
    not judge the operator prefix or length, so an unusual number passes
    through as bare digits rather than vanishing.
    """
    value = digits(raw)
    if value.startswith(COUNTRY_CODE):
        value = value[len(COUNTRY_CODE) :]
    if len(value) == 10 and value.startswith("1"):
        value = f"0{value}"
    return value


def is_bd_mobile(raw: str) -> bool:
    return bool(BD_MOBILE.match(local_bd_mobile(raw)))


def e164_bd_mobile(raw: str) -> str:
    """``+8801XXXXXXXXX`` for a valid BD mobile, else ``""``."""
    local = local_bd_mobile(raw)
    return f"+{COUNTRY_CODE}{local[1:]}" if BD_MOBILE.match(local) else ""


def validate_bd_mobile(value: str) -> None:
    if not is_bd_mobile(value):
        raise ValidationError(BD_MOBILE_HELP)
