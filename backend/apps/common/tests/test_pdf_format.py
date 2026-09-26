from __future__ import annotations

from decimal import Decimal

import pytest

from apps.common.templatetags.pdf_format import amount, money


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (Decimal("1234.5"), "৳1,234.50"),
        (Decimal("0"), "৳0.00"),
        (Decimal("-2500"), "৳-2,500.00"),
        (1234567, "৳1,234,567.00"),
        (None, "—"),
        ("", "—"),
        ("not-a-number", "—"),
    ],
)
def test_money_formats_bdt_amounts(value, expected):
    assert money(value) == expected


def test_amount_omits_the_symbol():
    assert amount(Decimal("98765.4")) == "98,765.40"


def test_amount_honours_extra_places_for_unit_costs():
    assert amount(Decimal("6450.5"), 4) == "6,450.5000"
