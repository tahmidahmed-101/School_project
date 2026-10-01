import { RefreshCw } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatMeasure } from "../measure"
import type { TurnoverComparison } from "../slices/reportingSlice"
import { DeltaBadge } from "./KpiCards"
import { ReportWidget } from "./ReportWidget"

interface Props {
  turnover: TurnoverComparison | null
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function StockTurnoverCard({ turnover, isLoading, error, onRetry, className }: Props) {
  const delta =
    turnover && turnover.previous ? ((turnover.current - turnover.previous) / turnover.previous) * 100 : null
  const sign = delta === null || delta === 0 ? "flat" : delta > 0 ? "up" : "down"

  return (
    <ReportWidget
      title="Stock turnover"
      description="Cost of goods sold in the period ÷ current inventory value"
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      // A 0 ratio is a real answer (no COGS posted), not missing data.
      isEmpty={!turnover}
      emptyIcon={RefreshCw}
      emptyTitle="No turnover data"
      skeleton={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-12 w-full" />
        </div>
      }
      className={className}
    >
      {turnover && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-3xl font-semibold tabular-nums">{formatMeasure(turnover.current, "ratio")}</p>
            <DeltaBadge delta={delta} sign={sign} good={delta === null || delta >= 0} />
          </div>
          <p className="text-sm text-muted-foreground">
            Previous period:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatMeasure(turnover.previous, "ratio")}
            </span>
          </p>
          <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
            Higher means stock sells through faster. It uses posted COGS journal entries, so it stays at 0
            until sales are posted to accounting.
          </p>
        </div>
      )}
    </ReportWidget>
  )
}
