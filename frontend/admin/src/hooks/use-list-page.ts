import { useCallback, useEffect, useMemo, useState } from "react"
import { useDebounced } from "./use-debounced"

/** What a list thunk dispatch returns: abortable, so a stale request can be cancelled. */
type Request = { abort?: () => void } | void

export interface ListSliceState {
  isFetchingList: boolean
  error: unknown
  totalItems: number
}

/**
 * State + fetching for a server-paginated list page.
 *
 * - `params` are the page's filters; whenever they (or the search)
 *   change, the list returns to page 1 — callers never reset paging by hand.
 * - The search box is debounced and trimmed before it is sent.
 * - Each fetch is aborted when a newer one starts or the page unmounts.
 * - `tableProps` spreads straight into <DataTable>.
 */
export function useListPage({
  fetch,
  state,
  params = {},
  pageSize = 20,
  initialSearch = "",
}: {
  fetch: (params: Record<string, unknown>) => Request
  state: ListSliceState
  params?: Record<string, unknown>
  pageSize?: number
  initialSearch?: string
}) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState(initialSearch)
  const debouncedSearch = useDebounced(search).trim()

  // Drop undefined / null / "" so callers can pass `{ status: status?.value }` directly.
  const filterKey = JSON.stringify(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ""))
  )
  const resetKey = `${filterKey}|${debouncedSearch}`
  const [lastResetKey, setLastResetKey] = useState(resetKey)
  if (lastResetKey !== resetKey) {
    // Adjusted during render rather than in an effect, so no request goes out for a stale page.
    setLastResetKey(resetKey)
    setPage(1)
  }

  const query = useMemo(
    () => ({
      ...(JSON.parse(filterKey) as Record<string, unknown>),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
    }),
    [filterKey, debouncedSearch]
  )

  const [reloadKey, setReloadKey] = useState(0)
  useEffect(() => {
    const request = fetch({ page, page_size: pageSize, ...query })
    return () => request?.abort?.()
    // `fetch` is usually an inline arrow; the request depends only on these values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, query, reloadKey])

  const reload = useCallback(() => setReloadKey((k) => k + 1), [])

  return {
    page,
    setPage,
    search,
    setSearch,
    debouncedSearch,
    /** The active filters (without paging), e.g. for an export of everything that matches. */
    query,
    reload,
    tableProps: {
      manualPagination: true as const,
      pageSize,
      pageIndex: page - 1,
      pageCount: Math.max(1, Math.ceil(state.totalItems / pageSize)),
      totalCount: state.totalItems,
      onPageChange: (index: number) => setPage(index + 1),
      isLoading: state.isFetchingList,
      error: state.error,
      onRetry: reload,
    },
  }
}
