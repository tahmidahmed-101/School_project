import { lazy, Suspense, useMemo } from "react"
import { LineChart as LineIcon } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/format"
import { formatDelta } from "../measure"
import type { RevenuePoint } from "../types"
import { ReportWidget } from "./ReportWidget"

const RevenueComparisonArea = lazy(() => import("./RevenueComparisonArea"))

interface Props {
  points: RevenuePoint[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function RevenueComparisonChart({ points, isLoading, error, onRetry, className }: Props) {
  const span = points?.length ?? 0
  const totals = useMemo(() => {
    const current = (points ?? []).reduce((sum, p) => sum + p.current, 0)
    const previous = (points ?? []).reduce((sum, p) => sum + p.previous, 0)
    return { current, previous, delta: previous ? ((current - previous) / previous) * 100 : null }
  }, [points])
  const isEmpty = !points || points.every((p) => p.current === 0 && p.previous === 0)

  return (
    <ReportWidget
      title="Stock revenue"
      description="Paid, non-cancelled stock orders per day vs. the previous period"
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={isEmpty}
      emptyIcon={LineIcon}
      emptyTitle="No revenue in this period"
      emptyDescription="Revenue appears here once paid orders come in. Try a wider date range."
      skeleton={<Skeleton className="h-[280px] w-full" />}
      className={className}
    >
      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-2">
        <div>
          <p className="text-xs text-muted-foreground">This period</p>
          <p className="text-xl font-semibold tabular-nums">{formatCurrency(totals.current)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Previous period</p>
          <p className="text-xl font-semibold tabular-nums text-muted-foreground">
            {formatCurrency(totals.previous)}
          </p>
        </div>
        {totals.delta !== null && (
          <p
            className={
              totals.delta >= 0
                ? "text-sm font-medium text-green-700 dark:text-green-500"
                : "text-sm font-medium text-red-700 dark:text-red-500"
            }
          >
            {formatDelta(totals.delta)}
          </p>
        )}
      </div>
      <Suspense fallback={<Skeleton className="h-[260px] w-full" />}>
        <RevenueComparisonArea points={points} span={span} />
      </Suspense>
      <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded bg-primary" />
          This period
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-slate-400" />
          Previous period
        </span>
      </div>
    </ReportWidget>
  )
}
