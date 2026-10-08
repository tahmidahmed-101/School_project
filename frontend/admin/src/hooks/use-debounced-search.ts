import { useEffect, useEffectEvent, useState } from "react"
import { useDebounced } from "./use-debounced"

interface DebouncedSearchOptions<T> {
  query: string
  delay?: number
  /** Nothing is requested while false (e.g. the popover or dialog is closed). */
  enabled: boolean
  search: (query: string, signal: AbortSignal) => Promise<T[]>
  /** Changes when something `search` closes over changes and the list must be refetched. */
  refetchKey?: string
}

/** Debounced search-as-you-type: the latest query wins, an in-flight request is aborted. */
export function useDebouncedSearch<T>({ query, delay, enabled, search, refetchKey }: DebouncedSearchOptions<T>) {
  const debouncedQuery = useDebounced(query, delay).trim()
  const [results, setResults] = useState<T[]>([])
  const [loading, setLoading] = useState(false)
  const runSearch = useEffectEvent(search)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    const run = async () => {
      setLoading(true)
      try {
        const items = await runSearch(debouncedQuery, controller.signal)
        if (!controller.signal.aborted) setResults(items)
      } catch {
        if (!controller.signal.aborted) setResults([])
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void run()
    return () => controller.abort()
  }, [enabled, debouncedQuery, refetchKey])

  return { results, loading }
}
