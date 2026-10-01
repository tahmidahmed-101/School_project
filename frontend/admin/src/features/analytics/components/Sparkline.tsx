import { useId } from "react"
import { Area, AreaChart, YAxis } from "recharts"
import { ChartContainer, type ChartConfig } from "@/components/ui/chart"
import { cn } from "@/lib/utils"

const config = {
  v: { label: "Value", theme: { light: "#0d9488", dark: "#2dd4bf" } },
} satisfies ChartConfig

/** Decorative trend line; the number it summarises is always shown as text next to it. */
export function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const gradientId = `spark-${useId().replace(/:/g, "")}`
  if (values.length < 2) return null
  const data = values.map((v, i) => ({ i, v }))
  return (
    <ChartContainer
      config={config}
      className={cn("aspect-auto h-10 w-full", className)}
      aria-hidden
      initialDimension={{ width: 120, height: 40 }}
    >
      <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-v)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="var(--color-v)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <YAxis hide domain={[0, "dataMax"]} />
        <Area
          type="monotone"
          dataKey="v"
          stroke="var(--color-v)"
          strokeWidth={1.5}
          fill={`url(#${gradientId})`}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
