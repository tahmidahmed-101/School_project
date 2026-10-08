import { Area, AreaChart, CartesianGrid, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCurrency } from "@/lib/format"
import { longDay, shiftDay, shortDay } from "../dateRange"
import { formatCompact } from "../measure"
import type { RevenuePoint } from "../types"
import { TooltipRow } from "./TooltipRow"

const config = {
  current: { label: "This period", color: "var(--primary)" },
  previous: { label: "Previous period", theme: { light: "#94a3b8", dark: "#64748b" } },
} satisfies ChartConfig

export default function RevenueComparisonArea({ points, span }: { points: RevenuePoint[] | undefined; span: number }) {
  return (
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
  )
}
