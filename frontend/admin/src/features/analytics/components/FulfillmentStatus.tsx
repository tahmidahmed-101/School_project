import { Truck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCount } from "../measure"
import type { FulfillmentMetric } from "../types"
import { DeltaBadge } from "./KpiCards"
import { ReportWidget } from "./ReportWidget"

interface Props {
  metrics: FulfillmentMetric[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function FulfillmentStatus({ metrics, isLoading, error, onRetry, className }: Props) {
  return (
    <ReportWidget
      title="Fulfillment"
      description="Orders created in this period, by where they are now"
      link={{ to: "/orders", label: "Orders" }}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={!metrics?.length || metrics.every((m) => m.value === 0)}
      emptyIcon={Truck}
      emptyTitle="No orders to fulfil"
      emptyDescription="Fulfillment progress appears once orders are placed in this period."
      skeleton={
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[74px] w-full" />
          ))}
        </div>
      }
      className={className}
    >
      <div className="grid grid-cols-2 gap-3">
        {metrics?.map((m) => (
          <div key={m.label} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{m.label}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xl font-semibold tabular-nums">{formatCount(m.value)}</span>
              <DeltaBadge
                delta={m.delta_pct}
                sign={m.delta_pct === null || m.delta_pct === 0 ? "flat" : m.delta_pct > 0 ? "up" : "down"}
                good={m.good}
              />
            </div>
          </div>
        ))}
      </div>
    </ReportWidget>
  )
}
