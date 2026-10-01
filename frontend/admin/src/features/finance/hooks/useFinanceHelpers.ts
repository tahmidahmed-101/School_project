import { useCallback, useEffect, useMemo, useState } from "react"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import type { Account, ExpenseCategory } from "../types"

/** True when the signed-in user holds any of the given StaffPermission codes. */
export function useCan(...codes: string[]): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  return codes.some((code) => hasPermission(permissions, code))
}

/** Debounces a search box so each keystroke doesn't fire a request. */
export function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const MAX_PAGES = 10

/**
 * Loads every page (100 per request, the backend max) of a small reference list such as the
 * chart of accounts, for pickers and id → name lookups.
 */
export function useAllPages<T>(endpoint: string, params?: Record<string, string>) {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})

  useEffect(() => {
    let cancelled = false
    const extra = JSON.parse(paramsKey) as Record<string, string>
    ;(async () => {
      setIsLoading(true)
      const all: T[] = []
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await api.get(endpoint, { params: { page, page_size: 100, ...extra } })
          const { items: pageItems, meta } = unwrapList<T>(res.data, page, 100)
          all.push(...pageItems)
          if (page >= meta.totalPages || pageItems.length === 0) break
        }
      } catch {
        // Lookups are best-effort; the page's own request surfaces real errors.
      }
      if (!cancelled) {
        setItems(all)
        setIsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [endpoint, paramsKey, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { items, isLoading, reload }
}

export function useAccounts() {
  const { items, isLoading, reload } = useAllPages<Account>("/admin/accounting/accounts/")
  const byId = useMemo(() => new Map(items.map((a) => [a.id, a])), [items])
  return { accounts: items, accountsById: byId, isLoading, reload }
}

export function useExpenseCategories() {
  const { items, isLoading, reload } = useAllPages<ExpenseCategory>("/admin/accounting/expense-categories/")
  const byId = useMemo(() => new Map(items.map((c) => [c.id, c])), [items])
  return { categories: items, categoriesById: byId, isLoading, reload }
}

export const accountLabel = (account: Account | undefined, fallback = "—") =>
  account ? `${account.code} · ${account.name}` : fallback
