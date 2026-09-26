from __future__ import annotations

# Chart-of-accounts codes referenced by name across services/postings.py and
# selectors/reports.py, seeded by management/commands/seed_chart_of_accounts.py.
# Keyed by the role blueprint §8's event table calls each account by.
ACCOUNT_CODES: dict[str, str] = {
    "inventory_asset": "1000",
    "accounts_receivable": "1100",
    "bank": "1200",
    "accounts_payable": "2000",
    "grni": "2100",
    "tax_payable": "2200",
    "refund_payable": "2300",
    "revenue": "4000",
    "sales_returns": "4100",
    "cogs": "5000",
    "inventory_shrinkage": "5100",
    "general_expense": "6900",
}
