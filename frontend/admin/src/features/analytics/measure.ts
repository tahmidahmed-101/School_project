import { formatCurrency } from "@/lib/format"
import type { MeasureUnit } from "./types"

const countFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const ratioFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const compactFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

/** Formats a KPI/ticker value by its backend `unit` (currency | count | ratio). */
export function formatMeasure(value: number | string, unit: MeasureUnit): string {
  const n = Number(value) || 0
  switch (unit) {
    case "currency":
      return formatCurrency(n)
    case "ratio":
      return `${ratioFmt.format(n)}×`
    case "count":
    default:
      return countFmt.format(n)
  }
}

export function formatCount(value: number | string): string {
  return countFmt.format(Number(value) || 0)
}

/** Short axis tick, e.g. 45.2K. */
export function formatCompact(value: number | string): string {
  return compactFmt.format(Number(value) || 0)
}

/** "+12.4%" / "−3.1%" / "0%". */
export function formatDelta(delta: number): string {
  const abs = Math.abs(delta)
  const text = `${abs >= 100 ? Math.round(abs) : abs.toFixed(1).replace(/\.0$/, "")}%`
  if (delta > 0) return `+${text}`
  if (delta < 0) return `−${text}`
  return text
}
