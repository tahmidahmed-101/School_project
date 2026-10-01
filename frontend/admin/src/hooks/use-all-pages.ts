import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchAllPages } from "@/lib/api/fetchAll"

type Result<T> = { key: string; items: T[]; error: unknown }

/**
 * Loads every page of a small reference list (accounts, warehouses, suppliers…) for pickers
 * and id → record lookups. Lookups are best-effort: a failure leaves `items` empty and sets
 * `error`, and the page's own request is what surfaces errors to the user.
 */
export function useAllPages<T extends { id: string }>(
  endpoint: string,
  params?: Record<string, unknown>,
  { enabled = true }: { enabled?: boolean } = {}
) {
  const [reloadKey, setReloadKey] = useState(0)
  const paramsKey = JSON.stringify(params ?? {})
  const requestKey = `${endpoint}|${paramsKey}|${reloadKey}`
  const [result, setResult] = useState<Result<T>>({ key: "", items: [], error: null })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    fetchAllPages<T>(endpoint, JSON.parse(paramsKey) as Record<string, unknown>).then(
      (items) => !cancelled && setResult({ key: requestKey, items, error: null }),
      (error) => !cancelled && setResult({ key: requestKey, items: [], error })
    )
    return () => {
      cancelled = true
    }
  }, [endpoint, paramsKey, requestKey, enabled])

  const items = result.items
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const reload = useCallback(() => setReloadKey((k) => k + 1), [])
  return { items, byId, isLoading: enabled && result.key !== requestKey, error: result.error, reload }
}
