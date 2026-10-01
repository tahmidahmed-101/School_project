import { useMemo } from "react"
import { LineChart as LineIcon } from "lucide-react"
import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/format"
import { longDay, shiftDay, shortDay } from "../dateRange"
import { formatCompact, formatDelta } from "../measure"
import type { RevenuePoint } from "../types"
import { ReportWidget } from "./ReportWidget"
import { TooltipRow } from "./TooltipRow"

const config = {
  current: { label: "This period", theme: { light: "#0d9488", dark: "#2dd4bf" } },
  previous: { label: "Previous period", theme: { light: "#94a3b8", dark: "#64748b" } },
} satisfies ChartConfig

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
      title="Revenue"
      description="Paid, non-cancelled orders per day vs. the previous period"
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
      <ChartContainer config={config} className="aspect-auto h-[260px] w-full">
        <AreaChart data={points} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revenue-current-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-current)" stopOpacity={0.25} />
              <stop offset="100%" stopColor="var(--color-current)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={shortDay}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatCompact} />
          <ChartTooltip
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.label as string | undefined
                  return day ? longDay(day) : ""
                }}
                formatter={(value, name, item) => {
                  const key = String(name) as keyof typeof config
                  const day = item.payload?.label as string | undefined
                  const label =
                    key === "previous" && day ? `${config.previous.label} (${shortDay(shiftDay(day, -span))})` : config[key]?.label
                  return (
                    <TooltipRow
                      color={item.color}
                      dashed={key === "previous"}
                      label={label}
                      value={formatCurrency(Number(value))}
                    />
                  )
                }}
              />
            }
          />
          <Line
            dataKey="previous"
            type="monotone"
            stroke="var(--color-previous)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
          />
          <Area
            dataKey="current"
            type="monotone"
            stroke="var(--color-current)"
            strokeWidth={2}
            fill="url(#revenue-current-fill)"
            dot={false}
          />
        </AreaChart>
      </ChartContainer>
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
