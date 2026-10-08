from __future__ import annotations

from datetime import date

from apps.accounting.selectors.reports import balance_sheet, cash_flow, profit_and_loss

REPORT_COLUMNS = ("line_item", "amount")


def _rows(report: dict) -> list[list[str]]:
    return [
        [key, ", ".join(value) if isinstance(value, list) else str(value)]
        for key, value in report.items()
    ]


def profit_and_loss_rows(*, start: date, end: date, kind: str | None = None) -> list[list[str]]:
    return _rows(profit_and_loss(start=start, end=end, kind=kind))


def balance_sheet_rows(*, as_of: date, kind: str | None = None) -> list[list[str]]:
    return _rows(balance_sheet(as_of=as_of, kind=kind))


def cash_flow_rows(*, start: date, end: date, kind: str | None = None) -> list[list[str]]:
    return _rows(cash_flow(start=start, end=end, kind=kind))
