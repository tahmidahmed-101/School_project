import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchAllPages } from "@/lib/api/fetchAll"

type Result<T> = { key: string; items: T[]; error: unknown }

interface Entry {
  promise: Promise<unknown[]>
  controller: AbortController
  waiters: number
  items: unknown[] | null
}

const cache = new Map<string, Entry>()

const cacheKey = (endpoint: string, paramsKey: string) => `${endpoint}|${paramsKey}`

/** Forget the cached lists of `endpoint` (all of them when omitted); call it after any write to that endpoint. */
export function invalidateAllPages(endpoint?: string) {
  for (const key of cache.keys()) {
    if (!endpoint || key.startsWith(`${endpoint}|`)) cache.delete(key)
  }
}

function acquire(endpoint: string, paramsKey: string): Entry {
  const key = cacheKey(endpoint, paramsKey)
  const cached = cache.get(key)
  if (cached) return cached
  const controller = new AbortController()
  const entry: Entry = {
    promise: fetchAllPages<unknown>(endpoint, JSON.parse(paramsKey) as Record<string, unknown>, {
      signal: controller.signal,
    }),
    controller,
    waiters: 0,
    items: null,
  }
  entry.promise.then(
    (items) => {
      entry.items = items
    },
    () => {
      if (cache.get(key) === entry) cache.delete(key)
    }
  )
  cache.set(key, entry)
  return entry
}

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
  const [result, setResult] = useState<Result<T>>(() => {
    const items = enabled ? cache.get(cacheKey(endpoint, paramsKey))?.items : null
    return items ? { key: requestKey, items: items as T[], error: null } : { key: "", items: [], error: null }
  })

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const entry = acquire(endpoint, paramsKey)
    entry.waiters += 1
    entry.promise.then(
      (items) =>
        !cancelled &&
        setResult((prev) =>
          prev.key === requestKey && prev.items === items ? prev : { key: requestKey, items: items as T[], error: null }
        ),
      (error) => !cancelled && setResult({ key: requestKey, items: [], error })
    )
    return () => {
      cancelled = true
      entry.waiters -= 1
      if (entry.waiters > 0 || entry.items) return
      entry.controller.abort()
      if (cache.get(cacheKey(endpoint, paramsKey)) === entry) cache.delete(cacheKey(endpoint, paramsKey))
    }
  }, [endpoint, paramsKey, requestKey, enabled])

  const items = result.items
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const reload = useCallback(() => {
    cache.delete(cacheKey(endpoint, paramsKey))
    setReloadKey((k) => k + 1)
  }, [endpoint, paramsKey])
  return { items, byId, isLoading: enabled && result.key !== requestKey, error: result.error, reload }
}
