// The backend uses at least 3 different response shapes across endpoints:
//   1. { data: {...}, message }               — single objects, some list-like endpoints
//   2. { count, next, previous, results }      — plain DRF pagination
//   3. { data: [...], pagination: {...} }      — custom paginated wrapper
// These helpers normalize all of them so slices/components never special-case shape.

export interface ListMeta {
  count: number
  page: number
  pageSize: number
  totalPages: number
}

export interface NormalizedList<T> {
  items: T[]
  meta: ListMeta
}

function pageFromUrl(url: string | null): number | null {
  if (!url) return null
  try {
    const parsed = new URL(url, window.location.origin)
    const page = parsed.searchParams.get("page")
    return page ? Number(page) : null
  } catch {
    return null
  }
}

export function unwrapList<T>(
  raw: unknown,
  requestedPage = 1,
  requestedPageSize = 20
): NormalizedList<T> {
  const body = raw as Record<string, unknown> | null | undefined

  // Kull-mart shape: { data: { results, count, next, previous }, message } — the DRF page
  // nested inside the standard envelope. Unwrap one level and treat it as shape 2.
  if (
    body &&
    body.data &&
    typeof body.data === "object" &&
    !Array.isArray(body.data) &&
    Array.isArray((body.data as Record<string, unknown>).results)
  ) {
    return unwrapList<T>(body.data, requestedPage, requestedPageSize)
  }

  // Shape 2: { count, next, previous, results }
  if (body && Array.isArray(body.results)) {
    const count = typeof body.count === "number" ? body.count : body.results.length
    const nextPage = pageFromUrl(body.next as string | null)
    const page = nextPage ? nextPage - 1 : requestedPage
    return {
      items: body.results as T[],
      meta: {
        count,
        page,
        pageSize: requestedPageSize,
        totalPages: Math.max(1, Math.ceil(count / requestedPageSize)),
      },
    }
  }

  // Shape 3: { data: [...], pagination: {...} }
  if (body && Array.isArray(body.data) && body.pagination) {
    const pagination = body.pagination as Record<string, unknown>
    const count = typeof pagination.total === "number" ? pagination.total : body.data.length
    const pageSize = typeof pagination.page_size === "number" ? pagination.page_size : requestedPageSize
    return {
      items: body.data as T[],
      meta: {
        count,
        page: typeof pagination.page === "number" ? pagination.page : requestedPage,
        pageSize,
        totalPages:
          typeof pagination.total_pages === "number"
            ? pagination.total_pages
            : Math.max(1, Math.ceil(count / pageSize)),
      },
    }
  }

  // Shape 1 (bare array under `data`, no pagination info)
  if (body && Array.isArray(body.data)) {
    return {
      items: body.data as T[],
      meta: { count: body.data.length, page: 1, pageSize: body.data.length || requestedPageSize, totalPages: 1 },
    }
  }

  // Bare array
  if (Array.isArray(raw)) {
    return {
      items: raw as T[],
      meta: { count: raw.length, page: 1, pageSize: raw.length || requestedPageSize, totalPages: 1 },
    }
  }

  return { items: [], meta: { count: 0, page: 1, pageSize: requestedPageSize, totalPages: 0 } }
}

export function unwrapItem<T>(raw: unknown): T {
  const body = raw as Record<string, unknown> | null | undefined
  if (body && typeof body === "object" && "data" in body && !Array.isArray(body.data)) {
    return body.data as T
  }
  return raw as T
}

// Some endpoints (inventory) always wrap the payload under `data` — including when `data`
// is itself an array, and `message` isn't always present — unlike unwrapItem's heuristic
// above which assumes an array under `data` means "this IS the list" (shape 1 vs bare-array
// ambiguity). Use this instead of unwrapItem/unwrapList when an endpoint is confirmed to
// always wrap its payload under `data`, regardless of whether `message` is also present.
export function unwrapEnvelope<T>(raw: unknown): T {
  const body = raw as Record<string, unknown> | null | undefined
  if (body && typeof body === "object" && "data" in body) {
    return body.data as T
  }
  return raw as T
}
