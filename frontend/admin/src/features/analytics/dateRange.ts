import { useCallback, useMemo } from "react"
import { useSearchParams } from "react-router-dom"
import { addDays, differenceInCalendarDays, format, isValid, startOfMonth, subDays } from "date-fns"
import { parseDate } from "@/lib/format"
import type { DateRangeParams } from "./types"

export type RangePreset = "7d" | "30d" | "90d" | "month" | "custom"

export const RANGE_PRESETS: { value: Exclude<RangePreset, "custom">; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
]

export const DEFAULT_PRESET: RangePreset = "30d"

const ISO = "yyyy-MM-dd"
const toISO = (d: Date) => format(d, ISO)

/** The backend's start/end are inclusive calendar days in the user's local calendar. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today = new Date()): DateRangeParams {
  const end = toISO(today)
  switch (preset) {
    case "7d":
      return { start: toISO(subDays(today, 6)), end }
    case "90d":
      return { start: toISO(subDays(today, 89)), end }
    case "month":
      return { start: toISO(startOfMonth(today)), end }
    case "30d":
    default:
      return { start: toISO(subDays(today, 29)), end }
  }
}

/** Same rule as the backend's _previous_window: the equally long window ending the day before start. */
export function previousWindow({ start, end }: DateRangeParams): DateRangeParams {
  const s = parseDate(start) ?? new Date()
  const e = parseDate(end) ?? s
  const span = differenceInCalendarDays(e, s) + 1
  const prevEnd = subDays(s, 1)
  return { start: toISO(subDays(prevEnd, span - 1)), end: toISO(prevEnd) }
}

export function rangeKey({ start, end }: DateRangeParams): string {
  return `${start}_${end}`
}

export function rangeLength({ start, end }: DateRangeParams): number {
  const s = parseDate(start)
  const e = parseDate(end)
  return s && e ? differenceInCalendarDays(e, s) + 1 : 0
}

function validIso(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = parseDate(value)
  return d && isValid(d) ? value : null
}

/**
 * Report window kept in the URL (?range=30d or ?range=custom&start=&end=), so it survives
 * reloads, is shareable, and carries over between Overview and Analytics links.
 */
export function useDateRange() {
  const [params, setParams] = useSearchParams()
  const rawPreset = params.get("range") as RangePreset | null
  const rawStart = validIso(params.get("start"))
  const rawEnd = validIso(params.get("end"))

  const { preset, range } = useMemo(() => {
    if (rawPreset === "custom" && rawStart && rawEnd) {
      const [start, end] = rawStart <= rawEnd ? [rawStart, rawEnd] : [rawEnd, rawStart]
      return { preset: "custom" as RangePreset, range: { start, end } }
    }
    const p =
      rawPreset && RANGE_PRESETS.some((x) => x.value === rawPreset)
        ? (rawPreset as Exclude<RangePreset, "custom">)
        : (DEFAULT_PRESET as Exclude<RangePreset, "custom">)
    return { preset: p as RangePreset, range: presetRange(p) }
  }, [rawPreset, rawStart, rawEnd])

  const setPreset = useCallback(
    (next: Exclude<RangePreset, "custom">) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          out.delete("start")
          out.delete("end")
          if (next === DEFAULT_PRESET) out.delete("range")
          else out.set("range", next)
          return out
        },
        { replace: true }
      )
    },
    [setParams]
  )

  const setCustom = useCallback(
    (from: Date, to: Date) => {
      setParams(
        (prev) => {
          const out = new URLSearchParams(prev)
          out.set("range", "custom")
          out.set("start", toISO(from))
          out.set("end", toISO(to))
          return out
        },
        { replace: true }
      )
    },
    [setParams]
  )

  return { preset, range, setPreset, setCustom }
}

/** Query string to carry the current window onto another report page's link. */
export function rangeSearch(preset: RangePreset, range: DateRangeParams): string {
  if (preset === "custom") return `?range=custom&start=${range.start}&end=${range.end}`
  return preset === DEFAULT_PRESET ? "" : `?range=${preset}`
}

/** "Sep 1" style axis label for a "YYYY-MM-DD" day. */
export function shortDay(iso: string): string {
  const d = parseDate(iso)
  return d ? format(d, "MMM d") : iso
}

/** "Sep 1, 2026" for a "YYYY-MM-DD" day. */
export function longDay(iso: string): string {
  const d = parseDate(iso)
  return d ? format(d, "MMM d, yyyy") : iso
}

/** The day `offset` days after `iso` (used to label previous-window points). */
export function shiftDay(iso: string, offset: number): string {
  const d = parseDate(iso)
  return d ? toISO(addDays(d, offset)) : iso
}
