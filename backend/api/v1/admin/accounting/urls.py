from __future__ import annotations

from django.urls import path

from .views import (
    AdminAccountDetailView,
    AdminAccountListCreateView,
    AdminAccountRestoreView,
    AdminExpenseCategoryDetailView,
    AdminExpenseCategoryListCreateView,
    AdminExpenseCategoryRestoreView,
    AdminExpenseDetailView,
    AdminExpenseListCreateView,
    AdminExpenseRestoreView,
    AdminJournalEntryDetailView,
    AdminJournalEntryListView,
    AdminJournalEntryReverseView,
    AdminTaxRateDetailView,
    AdminTaxRateListCreateView,
    AdminTaxRateRestoreView,
    BalanceSheetReportView,
    CashFlowReportView,
    InventoryValuationReportView,
    ProfitAndLossReportView,
)

app_name = "admin_accounting"

urlpatterns = [
    path("accounts/", AdminAccountListCreateView.as_view(), name="account-list"),
    path("accounts/<uuid:account_id>/", AdminAccountDetailView.as_view(), name="account-detail"),
    path(
        "accounts/<uuid:account_id>/restore/",
        AdminAccountRestoreView.as_view(),
        name="account-restore",
    ),
    path("journal-entries/", AdminJournalEntryListView.as_view(), name="journal-entry-list"),
    path(
        "journal-entries/<uuid:entry_id>/",
        AdminJournalEntryDetailView.as_view(),
        name="journal-entry-detail",
    ),
    path(
        "journal-entries/<uuid:entry_id>/reverse/",
        AdminJournalEntryReverseView.as_view(),
        name="journal-entry-reverse",
    ),
    path("expenses/", AdminExpenseListCreateView.as_view(), name="expense-list"),
    path("expenses/<uuid:expense_id>/", AdminExpenseDetailView.as_view(), name="expense-detail"),
    path(
        "expenses/<uuid:expense_id>/restore/",
        AdminExpenseRestoreView.as_view(),
        name="expense-restore",
    ),
    path(
        "expense-categories/",
        AdminExpenseCategoryListCreateView.as_view(),
        name="expense-category-list",
    ),
    path(
        "expense-categories/<uuid:category_id>/",
        AdminExpenseCategoryDetailView.as_view(),
        name="expense-category-detail",
    ),
    path(
        "expense-categories/<uuid:category_id>/restore/",
        AdminExpenseCategoryRestoreView.as_view(),
        name="expense-category-restore",
    ),
    path("tax-rates/", AdminTaxRateListCreateView.as_view(), name="tax-rate-list"),
    path("tax-rates/<uuid:tax_rate_id>/", AdminTaxRateDetailView.as_view(), name="tax-rate-detail"),
    path(
        "tax-rates/<uuid:tax_rate_id>/restore/",
        AdminTaxRateRestoreView.as_view(),
        name="tax-rate-restore",
    ),
    path("reports/profit-and-loss/", ProfitAndLossReportView.as_view(), name="report-pnl"),
    path("reports/balance-sheet/", BalanceSheetReportView.as_view(), name="report-balance-sheet"),
    path("reports/cash-flow/", CashFlowReportView.as_view(), name="report-cash-flow"),
    path(
        "reports/inventory-valuation/",
        InventoryValuationReportView.as_view(),
        name="report-inventory-valuation",
    ),
]
