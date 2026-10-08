import { lazy, Suspense, useMemo } from "react"
import { BarChart3 } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/format"
import { longDay } from "../dateRange"
import type { SalesTrendPoint } from "../types"
import { ReportWidget } from "./ReportWidget"

const SalesTrendBars = lazy(() => import("./SalesTrendBars"))

interface Props {
  points: SalesTrendPoint[] | null
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function SalesTrendChart({ points, isLoading, error, onRetry, className }: Props) {
  const data = useMemo(() => (points ?? []).map((p) => ({ date: p.date, total: Number(p.total) || 0 })), [points])
  const stats = useMemo(() => {
    const total = data.reduce((s, p) => s + p.total, 0)
    const best = data.reduce<{ date: string; total: number } | null>(
      (top, p) => (p.total > (top?.total ?? 0) ? p : top),
      null
    )
    return {
      total,
      average: data.length ? total / data.length : 0,
      best,
      activeDays: data.filter((p) => p.total > 0).length,
    }
  }, [data])

  return (
    <ReportWidget
      title="Sales trend"
      description="Daily revenue from paid, non-cancelled orders"
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={stats.total === 0}
      emptyIcon={BarChart3}
      emptyTitle="No sales in this period"
      emptyDescription="Daily sales appear here once paid orders come in. Try a wider date range."
      skeleton={
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
          <Skeleton className="h-[280px] w-full" />
        </div>
      }
      className={className}
    >
      <dl className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total sales" value={formatCurrency(stats.total)} />
        <Stat label="Daily average" value={formatCurrency(stats.average)} />
        <Stat
          label="Best day"
          value={stats.best ? formatCurrency(stats.best.total) : "—"}
          hint={stats.best ? longDay(stats.best.date) : undefined}
        />
        <Stat label="Days with sales" value={`${stats.activeDays} / ${data.length}`} />
      </dl>
      <Suspense fallback={<Skeleton className="h-[300px] w-full" />}>
        <SalesTrendBars data={data} />
      </Suspense>
    </ReportWidget>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  )
}
