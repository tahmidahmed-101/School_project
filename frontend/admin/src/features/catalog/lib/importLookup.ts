import { api, extractApiError } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Every row of a paginated admin list endpoint (page_size is capped at 100 server-side). */
export async function fetchAllPages<T>(endpoint: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const out: T[] = []
  try {
    for (let page = 1; page < 50; page++) {
      const res = await api.get(endpoint, { params: { ...params, page, page_size: 100 } })
      const { items, meta } = unwrapList<T>(res.data, page, 100)
      out.push(...items)
      if (out.length >= meta.count || items.length === 0) break
    }
  } catch (err) {
    throw extractApiError(err)
  }
  return out
}

/**
 * Splits a multi-value CSV cell ("a; b | c") into trimmed, de-duplicated parts. Commas split
 * too only when `commas` is set (names like "Shirts, Polos" would otherwise break).
 */
export const splitList = (raw: string, commas = false) =>
  Array.from(
    new Set(
      raw
        .split(commas ? /[;|,\n]/ : /[;|\n]/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  )

export interface ImportLookup<T extends { id: string }> {
  /** Name / slug / code / UUID → id. Throws `Label "X" not found` when nothing matches. */
  resolve: (raw: string) => Promise<string>
  /** Adds a record created during the import, so later rows can reference it. */
  add: (item: T) => void
  /** Drops the cache; the next resolve refetches. */
  reset: () => void
}

/**
 * A lazily-loaded, cached reference list for CSV import `resolve` callbacks: the list is
 * fetched once per import run (on the first row that needs it) and matched case-insensitively.
 */
export function createImportLookup<T extends { id: string }>(
  label: string,
  load: () => Promise<T[]>,
  keys: (item: T) => Array<string | null | undefined>
): ImportLookup<T> {
  let cache: Promise<T[]> | null = null
  const get = () => {
    if (!cache) {
      cache = load().catch((err) => {
        cache = null
        throw err
      })
    }
    return cache
  }

  return {
    async resolve(raw) {
      const value = raw.trim()
      const needle = value.toLowerCase()
      let items: T[]
      try {
        items = await get()
      } catch {
        throw new Error(`Could not load ${label.toLowerCase()} list to look up "${value}"`)
      }
      const byId = items.find((i) => i.id.toLowerCase() === needle)
      if (byId) return byId.id
      // Earlier keys win: a name match beats a code match on another record.
      const keyed = items.map((i) => ({ id: i.id, keys: keys(i).map((k) => k?.trim().toLowerCase()) }))
      const width = Math.max(0, ...keyed.map((k) => k.keys.length))
      for (let k = 0; k < width; k++) {
        const hit = keyed.find((i) => i.keys[k] === needle)
        if (hit) return hit.id
      }
      // An id we couldn't see (e.g. beyond the cached list): let the backend validate it.
      if (UUID_RE.test(value)) return value
      throw new Error(`${label} "${value}" not found`)
    },
    add(item) {
      if (cache) cache = cache.then((items) => [...items, item])
    },
    reset() {
      cache = null
    },
  }
}
