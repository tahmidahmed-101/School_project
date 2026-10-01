import { useState } from "react"
import { format } from "date-fns"
import { CalendarIcon, Loader2 } from "lucide-react"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { parseDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { RANGE_PRESETS, longDay, type RangePreset } from "../dateRange"
import type { DateRangeParams } from "../types"

interface DateRangeControlProps {
  preset: RangePreset
  range: DateRangeParams
  onPreset: (preset: Exclude<RangePreset, "custom">) => void
  onCustom: (from: Date, to: Date) => void
  /** Shows a small spinner while the page refetches for a new window. */
  busy?: boolean
}

export function DateRangeControl({ preset, range, onPreset, onCustom, busy }: DateRangeControlProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<DateRange | undefined>()

  const openPicker = (next: boolean) => {
    if (next) {
      setDraft({ from: parseDate(range.start) ?? undefined, to: parseDate(range.end) ?? undefined })
    }
    setOpen(next)
  }

  const apply = () => {
    if (draft?.from) {
      onCustom(draft.from, draft.to ?? draft.from)
      setOpen(false)
    }
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
        <div
          role="radiogroup"
          aria-label="Report period"
          className="inline-flex flex-wrap rounded-lg border border-border bg-card p-0.5"
        >
          {RANGE_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={preset === p.value}
              onClick={() => onPreset(p.value)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                preset === p.value && "bg-primary text-primary-foreground hover:text-primary-foreground"
              )}
            >
              {p.value === "month" ? "This month" : p.value.toUpperCase()}
              <span className="sr-only"> ({p.label})</span>
            </button>
          ))}
        </div>
        <Popover open={open} onOpenChange={openPicker}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="default"
              className={cn("font-normal", preset === "custom" && "border-primary text-primary")}
              aria-label="Choose a custom date range"
            >
              <CalendarIcon aria-hidden />
              {preset === "custom" ? "Custom" : "Custom range"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="range"
              numberOfMonths={2}
              defaultMonth={draft?.from}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
            />
            <div className="flex items-center justify-between gap-3 border-t border-border p-3">
              <span className="text-xs text-muted-foreground">
                {draft?.from
                  ? `${longDay(format(draft.from, "yyyy-MM-dd"))} – ${longDay(format(draft.to ?? draft.from, "yyyy-MM-dd"))}`
                  : "Pick a start and end day"}
              </span>
              <Button size="sm" onClick={apply} disabled={!draft?.from}>
                Apply
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <p className="text-xs text-muted-foreground sm:text-right" aria-live="polite">
        {longDay(range.start)} – {longDay(range.end)}
      </p>
    </div>
  )
}
