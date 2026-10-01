import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DeletedToggle } from "@/components/common/DeletedToggle"

/** Start/end calendar-day inputs ("YYYY-MM-DD"), matching the backend's `start` / `end` params. */
export function DateRangeInputs({
  start,
  end,
  onStartChange,
  onEndChange,
  idPrefix,
}: {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  idPrefix: string
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        id={`${idPrefix}-start`}
        type="date"
        aria-label="From date"
        value={start}
        max={end || undefined}
        onChange={(e) => onStartChange(e.target.value)}
        className="h-11 w-[150px]"
      />
      <span className="text-muted-foreground text-sm">to</span>
      <Input
        id={`${idPrefix}-end`}
        type="date"
        aria-label="To date"
        value={end}
        min={start || undefined}
        onChange={(e) => onEndChange(e.target.value)}
        className="h-11 w-[150px]"
      />
    </div>
  )
}

/** "Show deleted" toggle — backed by the backend's `include_deleted=true` (needs accounting.post). */
export function ShowDeletedToggle({
  checked,
  onCheckedChange,
}: {
  /** Kept for call-site compatibility; the chip needs no external id. */
  id?: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
}) {
  return <DeletedToggle pressed={checked} onPressedChange={onCheckedChange} />
}

export function RestoreButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div onClick={(e) => e.stopPropagation()} data-no-row-click="true">
      <Button type="button" variant="outline" size="sm" onClick={onClick} aria-label={`Restore ${label}`}>
        <RotateCcw className="size-3.5" /> Restore
      </Button>
    </div>
  )
}

/** Label/value row used in detail dialogs. */
export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right min-w-0 break-words">{children}</span>
    </div>
  )
}
