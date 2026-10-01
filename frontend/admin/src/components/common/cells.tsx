import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format"
import { StatusBadge } from "./StatusBadge"

/** Shared DataTable cell renderers, so the same kind of value looks the same on every page. */

export function DateCell({
  value,
  withTime = false,
  className,
}: {
  value: string | Date | null | undefined
  withTime?: boolean
  className?: string
}) {
  return (
    <span className={cn("text-sm whitespace-nowrap", className)}>
      {withTime ? formatDateTime(value) : formatDate(value)}
    </span>
  )
}

export function MoneyCell({
  value,
  currency,
  emphasis = false,
  className,
}: {
  value: number | string | null | undefined
  currency?: string
  /** Bold, for totals and amounts that are the point of the row. */
  emphasis?: boolean
  className?: string
}) {
  return (
    <span className={cn("text-sm tabular-nums whitespace-nowrap", emphasis && "font-semibold", className)}>
      {value === null || value === undefined || value === "" ? "—" : formatCurrency(value, currency)}
    </span>
  )
}

/** Product name over its SKU (and optional variant/extra line). */
export function ProductCell({ name, sku, sub }: { name: ReactNode; sku?: string | null; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-medium">{name}</div>
      {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
      {sku && <div className="truncate font-mono text-xs text-muted-foreground">{sku}</div>}
    </div>
  )
}

/** Plain text with a "—" fallback for empty values. */
export function TextCell({
  value,
  muted = false,
  fallback = "—",
  className,
}: {
  value: ReactNode
  muted?: boolean
  fallback?: ReactNode
  className?: string
}) {
  const empty = value === null || value === undefined || value === ""
  return <span className={cn("text-sm", (muted || empty) && "text-muted-foreground", className)}>{empty ? fallback : value}</span>
}

/** Status of a soft-deletable record: Deleted, else Active / Inactive. */
export function ActiveStatusBadge({ deleted, active }: { deleted?: boolean | string | null; active: boolean }) {
  return deleted ? (
    <StatusBadge status="deleted" tone="destructive" />
  ) : (
    <StatusBadge status={active ? "active" : "inactive"} />
  )
}
