from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.accounting.constants import ACCOUNT_CODES
from apps.accounting.models import Account

# (name, type) for each ACCOUNT_CODES key — every account blueprint §8's
# event table posts to.
ACCOUNT_DEFINITIONS: dict[str, tuple[str, str]] = {
    "inventory_asset": ("Inventory Asset", Account.Type.ASSET),
    "accounts_receivable": ("Accounts Receivable", Account.Type.ASSET),
    "bank": ("Bank", Account.Type.ASSET),
    "accounts_payable": ("Accounts Payable", Account.Type.LIABILITY),
    "grni": ("Goods Received Not Invoiced", Account.Type.LIABILITY),
    "tax_payable": ("Tax Payable", Account.Type.LIABILITY),
    "refund_payable": ("Refund Payable", Account.Type.LIABILITY),
    "revenue": ("Revenue", Account.Type.REVENUE),
    # Contra-revenue: carries a debit balance that nets against Revenue, so
    # returns are visible on the P&L instead of silently shrinking sales.
    "sales_returns": ("Sales Returns", Account.Type.REVENUE),
    "cogs": ("Cost of Goods Sold", Account.Type.EXPENSE),
    "inventory_shrinkage": ("Inventory Shrinkage Expense", Account.Type.EXPENSE),
    # Fallback for simple-mode expense categories created without a ledger account.
    "general_expense": ("General Expense", Account.Type.EXPENSE),
}


class Command(BaseCommand):
    help = (
        "Seed the chart of accounts every posting function in "
        "apps.accounting.services.postings depends on."
    )

    def handle(self, *args, **options):
        created = 0
        for key, code in ACCOUNT_CODES.items():
            name, account_type = ACCOUNT_DEFINITIONS[key]
            _, was_created = Account.objects.get_or_create(
                code=code, defaults={"name": name, "type": account_type}
            )
            created += int(was_created)
        self.stdout.write(
            self.style.SUCCESS(
                f"Chart of accounts ready — {created} account(s) created, "
                f"{len(ACCOUNT_CODES) - created} already existed."
            )
        )
