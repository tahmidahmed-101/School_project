from __future__ import annotations

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from django.db.models import DecimalField, F, Sum

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account, JournalEntry, JournalEntryLine
from apps.accounting.selectors.kind import COMPANY
from apps.inventory.models import StockItem


def _net_debit(
    *,
    account_types: list[str] | None = None,
    account_codes: list[str] | None = None,
    start: date | None = None,
    end: date | None = None,
    kind: str | None = None,
    reference_types: list[str] | None = None,
) -> Decimal:
    """sum(debit) - sum(credit) over posted lines matching the filters —
    positive for a debit-normal balance (asset/expense), negative for a
    credit-normal one (liability/equity/revenue).

    `kind` narrows to one half; `COMPANY` to entries that belong to neither."""
    lines = JournalEntryLine.objects.filter(journal_entry__status=JournalEntry.Status.POSTED)
    if kind:
        lines = lines.filter(journal_entry__kind="" if kind == COMPANY else kind)
    if reference_types:
        lines = lines.filter(journal_entry__reference_type__in=reference_types)
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


def _sales_and_cost(*, start: date, end: date, kind: str) -> tuple[Decimal, Decimal]:
    revenue = -_net_debit(account_types=[Account.Type.REVENUE], start=start, end=end, kind=kind)
    cogs = _net_debit(account_codes=[ACCOUNT_CODES["cogs"]], start=start, end=end, kind=kind)
    return revenue, cogs


def _gross_margin_percent(*, revenue: Decimal, gross_profit: Decimal) -> Decimal | None:
    if not revenue:
        return None
    return (gross_profit * 100 / revenue).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)


def profit_and_loss(*, start: date, end: date, kind: str | None = None) -> dict:
    """With `kind`: sales, cost of goods, and the write-offs and running costs
    marked for that half. Whole-business expenses are not allocated to a half, so
    the bottom line stops before them; they and net income are named in
    `company_wide_left_out`."""
    if kind:
        revenue, cogs = _sales_and_cost(start=start, end=end, kind=kind)
        kind_expenses = _net_debit(
            account_types=[Account.Type.EXPENSE], start=start, end=end, kind=kind
        )
        written_off = _net_debit(
            account_codes=[ACCOUNT_CODES["inventory_shrinkage"]], start=start, end=end, kind=kind
        )
        gross_profit = revenue - cogs
        operating_expenses = kind_expenses - cogs - written_off
        return {
            "kind": kind,
            "revenue": revenue,
            "cost_of_goods_sold": cogs,
            "gross_profit": gross_profit,
            "gross_margin_percent": _gross_margin_percent(
                revenue=revenue, gross_profit=gross_profit
            ),
            "goods_written_off": written_off,
            "operating_expenses": operating_expenses,
            "profit_before_company_costs": gross_profit - written_off - operating_expenses,
            "company_wide_left_out": ["company_wide_expenses", "net_income"],
        }
    revenue = -_net_debit(account_types=[Account.Type.REVENUE], start=start, end=end)
    cogs = _net_debit(account_codes=[ACCOUNT_CODES["cogs"]], start=start, end=end)
    all_expenses = _net_debit(account_types=[Account.Type.EXPENSE], start=start, end=end)
    operating_expenses = all_expenses - cogs
    gross_profit = revenue - cogs
    net_income = gross_profit - operating_expenses
    unassigned_revenue, unassigned_cogs = _sales_and_cost(start=start, end=end, kind=COMPANY)
    return {
        "revenue": revenue,
        "cost_of_goods_sold": cogs,
        "gross_profit": gross_profit,
        "gross_margin_percent": _gross_margin_percent(revenue=revenue, gross_profit=gross_profit),
        "operating_expenses": operating_expenses,
        "net_income": net_income,
        "unassigned_revenue": unassigned_revenue,
        "unassigned_cost_of_goods_sold": unassigned_cogs,
    }


def retained_earnings(*, as_of: date) -> Decimal:
    """Accumulated revenue less expenses over every posted entry up to `as_of`.

    Nothing closes the P&L into equity in this ledger, so the balance sheet
    derives it instead of reading a closing-entry balance.
    """
    return -_net_debit(account_types=[Account.Type.REVENUE, Account.Type.EXPENSE], end=as_of)


def balance_sheet(*, as_of: date, kind: str | None = None) -> dict:
    """With `kind`: only the accounts whose entries carry a kind. Cash, tax and
    equity belong to the one company and are named in `company_wide_left_out`."""
    if kind:

        def balance(key: str) -> Decimal:
            return _net_debit(account_codes=[ACCOUNT_CODES[key]], end=as_of, kind=kind)

        receivable = balance("accounts_receivable")
        refund_payable = -balance("refund_payable")
        return {
            "kind": kind,
            "inventory_asset": balance("inventory_asset"),
            "accounts_receivable": receivable,
            "refund_payable": refund_payable,
            # Minus means customers have paid ahead: deposits held, or a return not yet refunded.
            "customer_balance": receivable - refund_payable,
            "accounts_payable": -balance("accounts_payable"),
            "goods_received_not_billed": -balance("grni"),
            "company_wide_left_out": ["cash", "tax_payable", "equity", "retained_earnings"],
        }
    assets = _net_debit(account_types=[Account.Type.ASSET], end=as_of)
    liabilities = -_net_debit(account_types=[Account.Type.LIABILITY], end=as_of)
    contributed_equity = -_net_debit(account_types=[Account.Type.EQUITY], end=as_of)
    accumulated_earnings = retained_earnings(as_of=as_of)
    inventory_asset = _net_debit(account_codes=[ACCOUNT_CODES["inventory_asset"]], end=as_of)
    equity = contributed_equity + accumulated_earnings
    return {
        "assets": assets,
        "liabilities": liabilities,
        "contributed_equity": contributed_equity,
        "retained_earnings": accumulated_earnings,
        "equity": equity,
        "inventory_asset": inventory_asset,
        "other_assets": assets - inventory_asset,
        "liabilities_and_equity": liabilities + equity,
        "out_of_balance": assets - liabilities - equity,
    }


def cash_flow(*, start: date, end: date, kind: str | None = None) -> dict:
    """With `kind`: the bank movements of that half's customer and supplier
    documents and of the expenses marked for it. Whole-business expenses, capital
    and anything else with no kind stay company-wide."""
    bank = [ACCOUNT_CODES["bank"]]
    if kind:

        def moved(reference_types: list[str] | None = None) -> Decimal:
            return _net_debit(
                account_codes=bank,
                start=start,
                end=end,
                kind=kind,
                reference_types=reference_types,
            )

        receipts = moved(["customer_payment"])
        refunds = -moved(["customer_refund"])
        supplier_payments = -moved(["vendor_payment"])
        expenses_paid = -moved(["expense"])
        net = moved()
        return {
            "kind": kind,
            "customer_receipts": receipts,
            "customer_refunds": refunds,
            "supplier_payments": supplier_payments,
            "expenses_paid": expenses_paid,
            "other": net - receipts + refunds + supplier_payments + expenses_paid,
            "net_change_in_cash": net,
            "company_wide_left_out": [
                "company_wide_expenses_paid",
                "owner_money",
                "untagged_entries",
            ],
        }
    # Simplified: net change in the Bank account only (no separate
    # investing/financing tracking — nothing upstream produces those events).
    return {
        "net_change_in_cash": _net_debit(account_codes=bank, start=start, end=end),
        "company_wide": _net_debit(account_codes=bank, start=start, end=end, kind=COMPANY),
    }


def inventory_valuation(*, kind: str | None = None) -> Decimal:
    items = StockItem.objects.all()
    if kind:
        items = items.filter(variant__product__category__category_type=kind)
    total = items.aggregate(
        total=Sum(
            F("quantity_on_hand") * F("avg_cost"),
            output_field=DecimalField(max_digits=20, decimal_places=4),
        )
    )["total"]
    return total or Decimal("0")


def inventory_ledger_check(*, kind: str) -> dict:
    """Stock on hand at cost against the inventory account, for one half."""
    counted = inventory_valuation(kind=kind)
    ledger = _net_debit(account_codes=[ACCOUNT_CODES["inventory_asset"]], kind=kind)
    return {
        "inventory_value": counted,
        "ledger_inventory_asset": ledger,
        "ledger_difference": counted - ledger,
    }
