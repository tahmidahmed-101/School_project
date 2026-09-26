from __future__ import annotations

from datetime import date

from apps.accounting.selectors.reports import balance_sheet, cash_flow, profit_and_loss

REPORT_COLUMNS = ("line_item", "amount")


def _rows(report: dict) -> list[list[str]]:
    return [[key, str(value)] for key, value in report.items()]


def profit_and_loss_rows(*, start: date, end: date) -> list[list[str]]:
    return _rows(profit_and_loss(start=start, end=end))


def balance_sheet_rows(*, as_of: date) -> list[list[str]]:
    return _rows(balance_sheet(as_of=as_of))


def cash_flow_rows(*, start: date, end: date) -> list[list[str]]:
    return _rows(cash_flow(start=start, end=end))
