from __future__ import annotations

from datetime import date
from decimal import Decimal

from django.db.models import DecimalField, F, Sum

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.inventory.models import StockItem


def _net_debit(
    *,
    account_types: list[str] | None = None,
    account_codes: list[str] | None = None,
    start: date | None = None,
    end: date | None = None,
) -> Decimal:
    """sum(debit) - sum(credit) over posted lines matching the filters —
    positive for a debit-normal balance (asset/expense), negative for a
    credit-normal one (liability/equity/revenue)."""
    lines = JournalEntryLine.objects.filter(journal_entry__status=JournalEntry.Status.POSTED)
    if start:
        lines = lines.filter(journal_entry__entry_date__gte=start)
    if end:
        lines = lines.filter(journal_entry__entry_date__lte=end)
    if account_types:
        lines = lines.filter(account__type__in=account_types)
    if account_codes:
        lines = lines.filter(account__code__in=account_codes)
    totals = lines.aggregate(debit=Sum("debit"), credit=Sum("credit"))
    return (totals["debit"] or Decimal("0")) - (totals["credit"] or Decimal("0"))


def profit_and_loss(*, start: date, end: date) -> dict:
    revenue = -_net_debit(account_types=[Account.Type.REVENUE], start=start, end=end)
    cogs = _net_debit(account_codes=[ACCOUNT_CODES["cogs"]], start=start, end=end)
    all_expenses = _net_debit(account_types=[Account.Type.EXPENSE], start=start, end=end)
    operating_expenses = all_expenses - cogs
    gross_profit = revenue - cogs
    net_income = gross_profit - operating_expenses
    return {
        "revenue": revenue,
        "cost_of_goods_sold": cogs,
        "gross_profit": gross_profit,
        "operating_expenses": operating_expenses,
        "net_income": net_income,
    }


def retained_earnings(*, as_of: date) -> Decimal:
    """Accumulated revenue less expenses over every posted entry up to `as_of`.

    Nothing closes the P&L into equity in this ledger, so the balance sheet
    derives it instead of reading a closing-entry balance.
    """
    return -_net_debit(account_types=[Account.Type.REVENUE, Account.Type.EXPENSE], end=as_of)


def balance_sheet(*, as_of: date) -> dict:
    assets = _net_debit(account_types=[Account.Type.ASSET], end=as_of)
    liabilities = -_net_debit(account_types=[Account.Type.LIABILITY], end=as_of)
    contributed_equity = -_net_debit(account_types=[Account.Type.EQUITY], end=as_of)
    accumulated_earnings = retained_earnings(as_of=as_of)
    inventory_asset = _net_debit(account_codes=[ACCOUNT_CODES["inventory_asset"]], end=as_of)
    return {
        "assets": assets,
        "liabilities": liabilities,
        "contributed_equity": contributed_equity,
        "retained_earnings": accumulated_earnings,
        "equity": contributed_equity + accumulated_earnings,
        "inventory_asset": inventory_asset,
    }


def cash_flow(*, start: date, end: date) -> dict:
    # Simplified: net change in the Bank account only (no separate
    # investing/financing tracking — nothing upstream produces those events).
    return {
        "net_change_in_cash": _net_debit(
            account_codes=[ACCOUNT_CODES["bank"]], start=start, end=end
        )
    }


def inventory_valuation() -> Decimal:
    total = StockItem.objects.aggregate(
        total=Sum(
            F("quantity_on_hand") * F("avg_cost"),
            output_field=DecimalField(max_digits=20, decimal_places=4),
        )
    )["total"]
    return total or Decimal("0")
