"""A CSV export carries admin-entered text into a spreadsheet, where a leading
`=`, `+`, `-` or `@` is executed as a formula rather than shown as data."""

from __future__ import annotations

import pytest

from apps.common.utils.export import build_csv, sanitize_cell


@pytest.mark.parametrize(
    "dangerous",
    ["=cmd|'/c calc'!A1", "+1+1", "-2+3", "@SUM(A1)", "\tleading-tab", "\rleading-cr"],
)
def test_formula_prefixes_are_neutralised(dangerous):
    assert sanitize_cell(dangerous) == f"'{dangerous}"


@pytest.mark.parametrize("harmless", ["Wallet", "SKU-001", "2 x 3", "a=b", ""])
def test_ordinary_values_pass_through_unchanged(harmless):
    assert sanitize_cell(harmless) == harmless


def test_non_strings_are_left_alone():
    assert sanitize_cell(7) == 7
    assert sanitize_cell(None) is None


def test_build_csv_sanitizes_every_cell():
    csv_bytes = build_csv(["name", "sku"], [["=HYPERLINK(1)", "SKU-1"]])

    assert b"'=HYPERLINK(1)" in csv_bytes
