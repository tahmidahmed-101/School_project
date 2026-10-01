import { Landmark } from "lucide-react"
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
  nav: [
    {
      label: "Accounting",
      icon: Landmark,
      group: "FINANCE",
      order: 10,
      items: [
        { title: "Financial Reports", url: "/accounting/reports", permission: ["accounting.view", "accounting.post"] },
        { title: "Expenses", url: "/expenses", permission: ["accounting.view", "accounting.post"] },
        { title: "Journal Entries", url: "/accounting/journal-entries", permission: ["accounting.view", "accounting.post"] },
        { title: "Chart of Accounts", url: "/accounting/accounts", permission: ["accounting.view", "accounting.post"] },
        { title: "Tax Rates", url: "/accounting/tax-rates", permission: ["accounting.view", "accounting.post"] },
      ],
    },
  ],
}
