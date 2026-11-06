from decimal import Decimal

import pytest

from apps.common.utils.money import group_lakh, quantize, quantize_down


def test_quantize_rounds_half_up_once():
    assert quantize(Decimal("10.005")) == Decimal("10.01")
    assert quantize("2.675") == Decimal("2.68")
    assert quantize(3) == Decimal("3.00")


def test_quantize_down_never_exceeds_the_input():
    assert quantize_down(Decimal("10.019")) == Decimal("10.01")


@pytest.mark.parametrize("bad", ["abc", "1e3", "NaN", "", "1,000"])
def test_a_non_amount_string_is_refused(bad):
    with pytest.raises(ValueError):
        quantize(bad)


def test_a_non_finite_decimal_is_refused():
    with pytest.raises(ValueError):
        quantize(Decimal("NaN"))


def test_a_float_is_refused():
    with pytest.raises(TypeError):
        quantize(1.1)


def test_group_lakh_uses_lakh_and_crore_grouping():
    assert group_lakh("12345678.5") == "1,23,45,678.50"
    assert group_lakh(Decimal("-999")) == "-999.00"
