import { Shapes } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/format"
import type { CategoryShare } from "../types"
import { ReportWidget } from "./ReportWidget"

interface Props {
  categories: CategoryShare[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  /** Show at most this many rows; the rest are summed into "Other". */
  limit?: number
  className?: string
}

export function CategoryBreakdown({ categories, isLoading, error, onRetry, limit = 6, className }: Props) {
  const rows = categories ?? []
  const shown = rows.slice(0, limit)
  const rest = rows.slice(limit)
  if (rest.length) {
    shown.push({
      name: `Other (${rest.length})`,
      revenue: String(rest.reduce((s, r) => s + Number(r.revenue), 0)),
      pct: Math.round(rest.reduce((s, r) => s + r.pct, 0) * 10) / 10,
    })
  }
  const max = Math.max(...shown.map((r) => r.pct), 1)

  return (
    <ReportWidget
      title="Revenue by category"
      description="Share of line revenue in this period"
      link={{ to: "/categories", label: "Categories" }}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={rows.length === 0}
      emptyIcon={Shapes}
      emptyTitle="No category sales yet"
      emptyDescription="Category revenue appears once orders are paid in this period."
      skeleton={
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-2 w-full" />
            </div>
          ))}
        </div>
      }
      className={className}
    >
      <ul className="flex flex-col gap-4">
        {shown.map((row) => (
          <li key={row.name} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{row.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatCurrency(row.revenue)} · <span className="text-foreground">{row.pct}%</span>
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${(row.pct / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </ReportWidget>
  )
}
