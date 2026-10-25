from __future__ import annotations

import pytest

from apps.common.utils.phone import e164_bd_mobile, is_bd_mobile, local_bd_mobile


@pytest.mark.parametrize(
    "raw",
    [
        "01712345678",
        "+8801712345678",
        "8801712345678",
        "01712-345 678",
        "০১৭১২৩৪৫৬৭৮",
        "+৮৮০১৭১২৩৪৫৬৭৮",
    ],
)
def test_every_spelling_of_one_number_is_the_same_number(raw):
    assert local_bd_mobile(raw) == "01712345678"
    assert e164_bd_mobile(raw) == "+8801712345678"
    assert is_bd_mobile(raw)


@pytest.mark.parametrize("raw", ["", "০১২", "01012345678", "abc"])
def test_a_non_mobile_is_refused(raw):
    assert not is_bd_mobile(raw)
    assert e164_bd_mobile(raw) == ""
