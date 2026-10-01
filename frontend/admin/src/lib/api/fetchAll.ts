import { api, extractApiError } from "./client"
import { unwrapList } from "./envelope"

/** The backend caps page_size at 100. */
const PAGE_SIZE = 100

/**
 * Every row of a paginated admin list endpoint, fetched 100 at a time. `maxPages` bounds
 * runaway loops (50 pages = 5,000 rows). Throws an `ApiError` on failure.
 */
export async function fetchAllPages<T>(
  endpoint: string,
  params: Record<string, unknown> = {},
  { maxPages = 50 }: { maxPages?: number } = {}
): Promise<T[]> {
  const out: T[] = []
  try {
    for (let page = 1; page <= maxPages; page++) {
      const res = await api.get(endpoint, { params: { ...params, page, page_size: PAGE_SIZE } })
      const { items, meta } = unwrapList<T>(res.data, page, PAGE_SIZE)
      out.push(...items)
      if (items.length === 0 || page >= meta.totalPages || out.length >= meta.count) break
    }
  } catch (err) {
    throw extractApiError(err)
  }
  return out
}
