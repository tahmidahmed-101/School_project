import { useCallback, useEffect, useState } from "react"
import { useSelector } from "react-redux"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import type { procurementReducers } from "../reducers"

type ProcurementState = {
  [K in keyof typeof procurementReducers]: ReturnType<(typeof procurementReducers)[K]>
}

/**
 * Typed selector over this domain's slices. Typed against the procurement reducer map itself
 * (spread into the root store under the same keys) so it doesn't depend on RootState.
 */
export function useProcurementSelector<R>(selector: (state: ProcurementState) => R): R {
  return useSelector(selector as (state: unknown) => R)
}

/** True when the signed-in user holds any of the given StaffPermission codes. */
export function useCan(...codes: string[]): boolean {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  return codes.some((code) => hasPermission(permissions, code))
}

/** Purchasing writes need purchasing.manage. */
export const useCanManagePurchasing = () => useCan("purchasing.manage")
/** Vendor bills/payments: accounting.post or invoices.manage may write. */
export const useCanWriteBills = () => useCan("accounting.post", "invoices.manage")

export function useDebouncedValue(value: string, delay = 300): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value.trim()), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

const MAX_PAGES = 10

/** Loads every page (100 per request, the backend max) of a reference list for pickers. */
export function useAllPages<T>(endpoint: string, params?: Record<string, string>, enabled = true) {
  const [items, setItems] = useState<T[]>([])
  const [isLoading, setIsLoading] = useState(enabled)
  const [reloadKey, setReloadKey] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const run = async () => {
      setIsLoading(true)
      const extra = JSON.parse(paramsKey) as Record<string, string>
      const all: T[] = []
      try {
        for (let page = 1; page <= MAX_PAGES; page++) {
          const res = await api.get(endpoint, { params: { page, page_size: 100, ...extra } })
          const { items: pageItems, meta } = unwrapList<T>(res.data, page, 100)
          all.push(...pageItems)
          if (page >= meta.totalPages || pageItems.length === 0) break
        }
      } catch {
        // Best-effort lookup; the page's own request surfaces real errors.
      }
      if (!cancelled) {
        setItems(all)
        setIsLoading(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [endpoint, paramsKey, reloadKey, enabled])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { items, isLoading, reload }
}
