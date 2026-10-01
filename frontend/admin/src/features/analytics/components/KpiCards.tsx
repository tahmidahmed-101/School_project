import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BarChart3,
  Minus,
  PackageX,
  RefreshCw,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react"
import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/common/EmptyState"
import { cn } from "@/lib/utils"
import { formatDelta, formatMeasure } from "../measure"
import type { DashboardKpi, TrendDirection } from "../types"
import { WidgetError } from "./ReportWidget"
import { Sparkline } from "./Sparkline"

const ICONS: Record<string, LucideIcon> = {
  Revenue: Banknote,
  Orders: ShoppingCart,
  "Stock Turnover": RefreshCw,
  "Low Stock": PackageX,
}

export function DeltaBadge({
  delta,
  sign,
  good,
}: {
  delta: number | null
  sign: TrendDirection
  good: boolean
}) {
  if (delta === null) return null
  const Icon = sign === "up" ? ArrowUpRight : sign === "down" ? ArrowDownRight : Minus
  const tone =
    sign === "flat"
      ? "bg-muted text-muted-foreground"
      : good
        ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-500"
        : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-500"
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-medium", tone)}
      title="Change vs. the previous period of the same length"
    >
      <Icon className="size-3" aria-hidden />
      {formatDelta(delta)}
      <span className="sr-only">{good ? " (favourable)" : " (unfavourable)"} vs previous period</span>
    </span>
  )
}

function KpiCard({ kpi }: { kpi: DashboardKpi }) {
  const Icon = ICONS[kpi.label] ?? BarChart3
  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4" aria-hidden />
          </span>
          {kpi.label}
        </span>
        <DeltaBadge delta={kpi.delta_pct} sign={kpi.sign} good={kpi.good} />
        {kpi.delta_pct === null && !kpi.good && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-500/15 dark:text-red-500">
            Needs attention
          </span>
        )}
      </div>
      <p className="text-[26px] font-semibold leading-none tracking-tight tabular-nums">
        {formatMeasure(kpi.value, kpi.unit)}
      </p>
      {kpi.spark.length > 1 ? (
        <Sparkline values={kpi.spark} />
      ) : (
        <p className="flex h-10 items-end text-xs text-muted-foreground">
          {kpi.delta_pct === null ? "Current snapshot" : "vs. previous period"}
        </p>
      )}
    </Card>
  )
}

export function KpiCards({
  kpis,
  isLoading,
  error,
  onRetry,
}: {
  kpis: DashboardKpi[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
}) {
  if (error) {
    return (
      <Card className="p-0">
        <WidgetError error={error} onRetry={onRetry} className="py-8" />
      </Card>
    )
  }
  if (isLoading || !kpis) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="gap-3 p-5">
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-10 w-full" />
          </Card>
        ))}
      </div>
    )
  }
  if (kpis.length === 0) {
    return (
      <Card className="p-0">
        <EmptyState title="No metrics yet" description="Key metrics appear once the store has activity." />
      </Card>
    )
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {kpis.map((kpi) => (
        <KpiCard key={kpi.label} kpi={kpi} />
      ))}
    </div>
  )
}
