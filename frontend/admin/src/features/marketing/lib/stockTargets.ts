import { useMemo } from "react"
import { useAllPages } from "@/hooks/use-all-pages"
import { useCategoryOptions } from "@/features/catalog/lib/useCategoryOptions"
import type { Brand } from "@/features/catalog/types"
import type { NamedRef } from "../types"

export interface TickRow {
  id: string
  name: string
  depth: number
}

const BRANDS_ENDPOINT = "/admin/catalog/brands/"
const STOCK_BRANDS = { is_active: true, kind: "stock" }

// A saved target that is no longer offered (deleted or switched off) stays listed so it can be unticked.
const withSaved = (rows: TickRow[], saved: NamedRef[], isLoading: boolean) => {
  if (isLoading) return rows
  const known = new Set(rows.map((row) => row.id))
  return [...rows, ...saved.filter((ref) => !known.has(ref.id)).map((ref) => ({ ...ref, depth: 0 }))]
}

/** Stock categories in tree order, for a tick-list. */
export function useStockCategoryRows(saved: NamedRef[]) {
  const { options, isLoading } = useCategoryOptions()
  const rows = useMemo(
    () => withSaved(options.map((o) => ({ id: o.value, name: o.label, depth: o.depth })), saved, isLoading),
    [options, saved, isLoading]
  )
  return { rows, isLoading }
}

/** Active stock brands, for a tick-list. */
export function useStockBrandRows(saved: NamedRef[]) {
  const { items, isLoading } = useAllPages<Brand>(BRANDS_ENDPOINT, STOCK_BRANDS)
  const rows = useMemo(
    () => withSaved(items.map((b) => ({ id: b.id, name: b.name, depth: 0 })), saved, isLoading),
    [items, saved, isLoading]
  )
  return { rows, isLoading }
}
