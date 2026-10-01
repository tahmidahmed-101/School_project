import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Checkbox } from "@/components/ui/checkbox"

type SelectableRow = { id: string; name: string; deleted_at: string | null }

/**
 * Checkbox selection for a list page's bulk actions. Deleted rows can't be selected, and the
 * selection is dropped whenever `resetKey` (page + filters) changes so it never holds rows
 * that are no longer on screen.
 */
export function useRowSelection<T extends SelectableRow>(rows: T[], resetKey: string) {
  const [selected, setSelected] = useState<string[]>([])
  const [lastKey, setLastKey] = useState(resetKey)
  if (lastKey !== resetKey) {
    setLastKey(resetKey)
    setSelected([])
  }

  const selectable = rows.filter((r) => !r.deleted_at)
  const allSelected = selectable.length > 0 && selectable.every((r) => selected.includes(r.id))

  const column: ColumnDef<T> = {
    id: "select",
    header: () => (
      <Checkbox
        aria-label="Select all on this page"
        checked={allSelected}
        onCheckedChange={(v) => setSelected(v ? selectable.map((r) => r.id) : [])}
      />
    ),
    cell: ({ row }) =>
      row.original.deleted_at ? null : (
        <Checkbox
          aria-label={`Select ${row.original.name}`}
          checked={selected.includes(row.original.id)}
          onCheckedChange={(v) =>
            setSelected((prev) => (v ? [...prev, row.original.id] : prev.filter((x) => x !== row.original.id)))
          }
        />
      ),
  }

  return { selected, clear: () => setSelected([]), column }
}
