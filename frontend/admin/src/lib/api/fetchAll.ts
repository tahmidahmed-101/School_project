import { api, extractApiError } from "./client"
import { unwrapList } from "./envelope"

/** The backend caps page_size at 100. */
const PAGE_SIZE = 100
const PARALLEL_PAGES = 6

/**
 * Every row of a paginated admin list endpoint, fetched 100 at a time. `maxPages` bounds
 * runaway lists (50 pages = 5,000 rows). Throws an `ApiError` on failure.
 */
export async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  { maxPages = 50, signal }: { maxPages?: number; signal?: AbortSignal } = {}
): Promise<T[]> {
  const fetchPage = async (page: number) => {
    const res = await api.get(endpoint, { params: { ...params, page, page_size: PAGE_SIZE }, signal })
    return unwrapList<T>(res.data, page, PAGE_SIZE)
  }
  try {
    const { items: out, meta } = await fetchPage(1)
    if (out.length === 0 || out.length >= meta.count) return out
    // The server may have used a smaller page size than asked for.
    const lastPage = Math.min(maxPages, Math.max(meta.totalPages, Math.ceil(meta.count / out.length)))
    for (let start = 2; start <= lastPage; start += PARALLEL_PAGES) {
      const size = Math.min(PARALLEL_PAGES, lastPage - start + 1)
      const pages = await Promise.all(Array.from({ length: size }, (_, i) => fetchPage(start + i)))
      for (const page of pages) out.push(...page.items)
    }
    return out
  } catch (err) {
    throw extractApiError(err)
  }
}
