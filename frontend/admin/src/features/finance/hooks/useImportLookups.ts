import { useMemo } from "react"
import { fetchAllPages } from "@/lib/api/fetchAll"
import { createImportLookup, normalizeKey, UUID_RE } from "@/lib/importLookup"
import type { Account, AccountType, ExpenseCategory } from "../types"

/**
 * Cached reference lists for CSV-import resolvers, one per component: fetched on the first row
 * that needs them; `reset` after a run so the next one refetches.
 */
export function useFinanceImportLookups() {
  return useMemo(
    () => ({
      accountLookup: createImportLookup<Account>("Account", () =>
        fetchAllPages<Account>("/admin/accounting/accounts/")
      ),
      categoryLookup: createImportLookup<ExpenseCategory>("Category", () =>
        fetchAllPages<ExpenseCategory>("/admin/accounting/expense-categories/")
      ),
    }),
    []
  )
}

/**
 * Finds an account by UUID, code, name, or "code · name" / "code - name" (case-insensitive).
 * An unknown UUID is passed through for the backend to judge.
 */
export function findAccount(
  raw: string,
  accounts: Account[],
  { type, what = "Account" }: { type?: AccountType; what?: string } = {}
): string {
  const value = raw.trim()
  const needle = normalizeKey(value)
  const byId = accounts.find((a) => a.id.toLowerCase() === needle)
  if (!byId && UUID_RE.test(value)) return value

  let match = byId ?? accounts.find((a) => normalizeKey(a.code) === needle)
  if (!match) {
    const labelled = needle.match(/^(\S+)\s*(?:·|-|–|—|:)\s*(.+)$/)
    if (labelled) {
      match = accounts.find((a) => normalizeKey(a.code) === labelled[1] && normalizeKey(a.name) === labelled[2])
    }
  }
  if (!match) {
    const byName = accounts.filter((a) => normalizeKey(a.name) === needle && (!type || a.type === type))
    if (byName.length > 1) throw new Error(`${what} "${value}" matches several accounts; use the account code`)
    match = byName[0]
  }
  if (!match) throw new Error(`${what} "${value}" not found`)
  if (type && match.type !== type) throw new Error(`${what} "${value}" is not a ${type}-type account`)
  return match.id
}

/** Finds an expense category by UUID or name (case-insensitive). */
export function findExpenseCategory(raw: string, categories: ExpenseCategory[]): string {
  const value = raw.trim()
  const needle = normalizeKey(value)
  const match = categories.find((c) => c.id.toLowerCase() === needle || normalizeKey(c.name) === needle)
  if (match) return match.id
  if (UUID_RE.test(value)) return value
  throw new Error(`Category "${value}" not found`)
}
