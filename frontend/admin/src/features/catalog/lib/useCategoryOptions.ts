import { useMemo } from "react"
import { useAllPages } from "@/hooks/use-all-pages"
import type { Kind } from "@/hooks/use-kind"
import { CATEGORIES_ENDPOINT, categoryListParams } from "../api"
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

/** The categories of one kind (of both when no kind is given) as tree-ordered options, for pickers and filters. */
export function useCategoryOptions(kind?: Kind) {
  const { items: categories, isLoading, error, reload } = useAllPages<Category>(
    CATEGORIES_ENDPOINT,
    categoryListParams(kind)
  )

  const options = useMemo(() => buildCategoryTree(categories), [categories])
  const nameById = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])

  return { categories, options, nameById, isLoading, error, reload }
}
