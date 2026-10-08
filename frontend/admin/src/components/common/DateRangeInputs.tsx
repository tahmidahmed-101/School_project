import { Input } from "@/components/ui/input"

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
        className="h-10 w-[150px] bg-field-bg"
      />
      <span className="text-muted-foreground text-sm">to</span>
      <Input
        id={`${idPrefix}-end`}
        type="date"
        aria-label="To date"
        value={end}
        min={start || undefined}
        onChange={(e) => onEndChange(e.target.value)}
        className="h-10 w-[150px] bg-field-bg"
      />
    </div>
  )
}
