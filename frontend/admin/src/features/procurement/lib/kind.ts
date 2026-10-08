import { useMemo } from "react"

import type { Kind } from "@/hooks/use-kind"

export const purchasingBase = (kind?: Kind) => (kind === "preorder" ? "/preorder_purchasing" : "/purchasing")

export const purchasingTitle = (kind: Kind, text: string) =>
  kind === "preorder" ? `Pre-order ${text.toLowerCase()}` : text

/** The list slices are shared by both halves, so rows cached for the other half are dropped until the reload lands. */
export function useKindRows<T extends { kind?: Kind }>(rows: T[], kind: Kind): T[] {
  return useMemo(() => rows.filter((row) => (row.kind ?? "stock") === kind), [rows, kind])
}
