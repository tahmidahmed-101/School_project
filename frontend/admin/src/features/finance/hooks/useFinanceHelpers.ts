import { useAllPages } from "@/hooks/use-all-pages"
import type { Account, ExpenseCategory } from "../types"

export function useAccounts() {
  const { items, byId, isLoading, reload } = useAllPages<Account>("/admin/accounting/accounts/")
  return { accounts: items, accountsById: byId, isLoading, reload }
}

export function useExpenseCategories() {
  const { items, byId, isLoading, reload } = useAllPages<ExpenseCategory>("/admin/accounting/expense-categories/")
  return { categories: items, categoriesById: byId, isLoading, reload }
}

export const accountLabel = (account: Account | undefined, fallback = "—") =>
  account ? `${account.code} · ${account.name}` : fallback
