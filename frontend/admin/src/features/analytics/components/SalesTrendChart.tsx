import { useMemo } from "react"
import { BarChart3 } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency } from "@/lib/format"
import { longDay, shortDay } from "../dateRange"
import { formatCompact } from "../measure"
import type { SalesTrendPoint } from "../types"
import { ReportWidget } from "./ReportWidget"
import { TooltipRow } from "./TooltipRow"

const config = {
  total: { label: "Sales", theme: { light: "#0d9488", dark: "#2dd4bf" } },
} satisfies ChartConfig

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
      <ChartContainer config={config} className="aspect-auto h-[300px] w-full">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={24}
            tickFormatter={shortDay}
          />
          <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={formatCompact} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            content={
              <ChartTooltipContent
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.date as string | undefined
                  return day ? longDay(day) : ""
                }}
                formatter={(value, _name, item) => (
                  <TooltipRow color={item.color} label="Sales" value={formatCurrency(Number(value))} />
                )}
              />
            }
          />
          <Bar dataKey="total" fill="var(--color-total)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ChartContainer>
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
