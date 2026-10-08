import { page, type FeatureModule } from "@/app/moduleTypes"

export const financeModule: FeatureModule = {
  routes: [
    { path: "expenses", lazy: page(() => import("./components/Expenses")) },
    { path: "expenses/categories", lazy: page(() => import("./components/ExpenseCategories")) },
    { path: "accounting/accounts", lazy: page(() => import("./components/ChartOfAccounts")) },
    { path: "accounting/journal-entries", lazy: page(() => import("./components/JournalEntries")) },
    { path: "accounting/journal-entries/:id", lazy: page(() => import("./components/JournalEntryDetail")) },
    { path: "accounting/tax-rates", lazy: page(() => import("./components/TaxRates")) },
    { path: "accounting/reports", lazy: page(() => import("./components/FinancialReports")) },
  ],
}
