import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"

/** Bar shown above a table while rows are selected: the count, the bulk actions, and Clear. */
export function BulkActionBar({ count, onClear, children }: { count: number; onClear: () => void; children: ReactNode }) {
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2 text-sm">
      <span className="font-medium">{count} selected</span>
      {children}
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  )
}
