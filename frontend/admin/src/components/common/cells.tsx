import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { Package, type LucideIcon } from "lucide-react"
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
    <StatusBadge status="deleted" />
  ) : (
    <StatusBadge status={active ? "active" : "inactive"} />
  )
}

/** A link to the record a row refers to. A click on it never counts as a click on the row. */
export function LinkCell({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className={cn("text-sm text-primary hover:underline", className)}
      onClick={(e) => e.stopPropagation()}
      data-no-row-click="true"
    >
      {children}
    </Link>
  )
}

/** Small square image with an icon in its place when there is none. */
export function Thumbnail({
  src,
  icon: Icon = Package,
  className,
}: {
  src?: string | null
  icon?: LucideIcon
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted",
        className
      )}
    >
      {src ? (
        <img loading="lazy" decoding="async" src={src} alt="" className="size-full object-cover" />
      ) : (
        <Icon className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}
