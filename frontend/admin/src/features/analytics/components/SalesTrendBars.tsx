import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { formatCurrency } from "@/lib/format"
import { longDay, shortDay } from "../dateRange"
import { formatCompact } from "../measure"
import { TooltipRow } from "./TooltipRow"

const config = {
  total: { label: "Sales", color: "var(--primary)" },
} satisfies ChartConfig

export default function SalesTrendBars({ data }: { data: { date: string; total: number }[] }) {
  return (
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
  )
}
