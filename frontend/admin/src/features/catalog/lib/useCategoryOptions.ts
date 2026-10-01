import { useCallback, useEffect, useMemo, useState } from "react"
import { fetchAllCategories } from "../api"
import type { Category } from "../types"

export interface CategoryOption {
  label: string
  value: string
  depth: number
  category: Category
}

/** Orders categories depth-first by parent_id, so a flat list reads as a tree. */
export function buildCategoryTree(categories: Category[]): CategoryOption[] {
  const byParent = new Map<string | null, Category[]>()
  const ids = new Set(categories.map((c) => c.id))
  for (const c of categories) {
    // An orphan (parent filtered out / deleted) is shown at the root rather than lost.
    const key = c.parent_id && ids.has(c.parent_id) ? c.parent_id : null
    const list = byParent.get(key) ?? []
    list.push(c)
    byParent.set(key, list)
  }
  for (const list of byParent.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  const out: CategoryOption[] = []
  const walk = (parent: string | null, depth: number) => {
    for (const c of byParent.get(parent) ?? []) {
      out.push({ label: c.name, value: c.id, depth, category: c })
      if (depth < 20) walk(c.id, depth + 1)
    }
  }
  walk(null, 0)
  return out
}

/** All categories (every page) as tree-ordered options, for pickers and filters. */
export function useCategoryOptions(includeDeleted = false) {
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const items = await fetchAllCategories({ include_deleted: includeDeleted })
        if (cancelled) return
        setCategories(items)
        setError(null)
      } catch (err) {
        if (!cancelled) setError(err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [includeDeleted, reloadKey])

  const reload = useCallback(() => {
    setIsLoading(true)
    setReloadKey((k) => k + 1)
  }, [])

  const options = useMemo(() => buildCategoryTree(categories), [categories])
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  return { categories, options, nameById, isLoading, error, reload }
}
