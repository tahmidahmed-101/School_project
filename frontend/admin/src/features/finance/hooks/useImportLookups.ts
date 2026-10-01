import { useCallback, useMemo, useRef } from "react"
import { api } from "@/lib/api/client"
import { unwrapList } from "@/lib/api/envelope"
import type { Account, AccountType, ExpenseCategory } from "../types"

const PAGE_SIZE = 100 // backend max
const MAX_PAGES = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function fetchAllPages<T>(endpoint: string): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await api.get(endpoint, { params: { page, page_size: PAGE_SIZE } })
    const { items, meta } = unwrapList<T>(res.data, page, PAGE_SIZE)
    all.push(...items)
    if (page >= meta.totalPages || items.length === 0) break
  }
  return all
}

/**
 * Reference list for CSV-import resolvers: fetched on first use, then cached for the rest of
 * the import run. `add` appends a record created during the run (e.g. a parent account
 * imported a few rows earlier); `reset` drops the cache so the next run refetches.
 */
export function useImportLookup<T>(endpoint: string) {
  const cache = useRef<Promise<T[]> | null>(null)

  const get = useCallback(() => {
    if (!cache.current) {
      cache.current = fetchAllPages<T>(endpoint).catch((err) => {
        cache.current = null
        throw err
      })
    }
    return cache.current
  }, [endpoint])

  const add = useCallback((item: T) => {
    if (cache.current) cache.current = cache.current.then((list) => [...list, item])
  }, [])

  const reset = useCallback(() => {
    cache.current = null
  }, [])

  return useMemo(() => ({ get, add, reset }), [get, add, reset])
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ")

/**
 * Finds an account by UUID, code, name, or "code · name" / "code - name" (case-insensitive).
 * An unknown UUID is passed through for the backend to judge.
 */
export function findAccount(
  raw: string,
  accounts: Account[],
  { type, what = "Account" }: { type?: AccountType; what?: string } = {}
): string {
  const value = raw.trim()
  const needle = norm(value)
  const byId = accounts.find((a) => a.id.toLowerCase() === needle)
  if (!byId && UUID_RE.test(value)) return value

  let match = byId ?? accounts.find((a) => norm(a.code) === needle)
  if (!match) {
    const labelled = needle.match(/^(\S+)\s*(?:·|-|–|—|:)\s*(.+)$/)
    if (labelled) {
      match = accounts.find((a) => norm(a.code) === labelled[1] && norm(a.name) === labelled[2])
    }
  }
  if (!match) {
    const byName = accounts.filter((a) => norm(a.name) === needle && (!type || a.type === type))
    if (byName.length > 1) throw new Error(`${what} "${value}" matches several accounts; use the account code`)
    match = byName[0]
  }
  if (!match) throw new Error(`${what} "${value}" not found`)
  if (type && match.type !== type) throw new Error(`${what} "${value}" is not a ${type}-type account`)
  return match.id
}

/** Finds an expense category by UUID or name (case-insensitive). */
export function findExpenseCategory(raw: string, categories: ExpenseCategory[]): string {
  const value = raw.trim()
  const needle = norm(value)
  const match = categories.find((c) => c.id.toLowerCase() === needle || norm(c.name) === needle)
  if (match) return match.id
  if (UUID_RE.test(value)) return value
  throw new Error(`Category "${value}" not found`)
}
