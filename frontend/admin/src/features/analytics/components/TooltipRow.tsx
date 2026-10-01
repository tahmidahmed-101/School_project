import type { ReactNode } from "react"

/** One tooltip line for ChartTooltipContent's `formatter`: swatch, series name, formatted value. */
export function TooltipRow({
  color,
  label,
  value,
  dashed,
}: {
  color?: string
  label: ReactNode
  value: ReactNode
  dashed?: boolean
}) {
  return (
    <div className="flex w-full items-center gap-2">
      <span
        className={
          dashed
            ? "h-0 w-2.5 shrink-0 border-t-2 border-dashed"
            : "size-2.5 shrink-0 rounded-[2px]"
        }
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto pl-3 font-mono font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}
