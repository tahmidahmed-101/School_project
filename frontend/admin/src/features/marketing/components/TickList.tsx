import { Checkbox } from "@/components/ui/checkbox"
import type { TickRow } from "../lib/stockTargets"

/** Scrollable tick-list over a small reference list (categories, brands). */
export function TickList({
  rows,
  selected,
  onChange,
  disabled,
  isLoading,
  noun,
}: {
  rows: TickRow[]
  selected: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
  isLoading: boolean
  /** Plural, e.g. "categories". */
  noun: string
}) {
  return (
    <div className="max-h-64 overflow-y-auto rounded-lg border border-field-border p-2">
      {rows.length === 0 ? (
        <p className="p-2 text-sm text-muted-foreground">{isLoading ? `Loading ${noun}...` : `No ${noun} yet.`}</p>
      ) : (
        rows.map((row) => (
          <label
            key={row.id}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
            style={{ paddingLeft: `${0.5 + row.depth * 1.25}rem` }}
          >
            <Checkbox
              checked={selected.includes(row.id)}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onChange(checked ? [...selected, row.id].sort() : selected.filter((id) => id !== row.id))
              }
            />
            {row.name}
          </label>
        ))
      )}
    </div>
  )
}
