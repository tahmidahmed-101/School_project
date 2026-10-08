import { Ban, Check } from "lucide-react"

import type { OrderStatus } from "@/features/sales/types"
import { cn } from "@/lib/utils"

const PROGRESS_STEPS = ["Placed", "Confirmed", "Shipped", "Delivered"] as const

/** How many progress steps an order in this status has completed. */
function stepsDone(status: OrderStatus): number {
  switch (status) {
    case "confirmed":
      return 2
    case "shipped":
      return 3
    case "delivered":
    case "closed":
      return 4
    default:
      return 1
  }
}

export function CancelledNotice({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive">
      <Ban className="size-4 shrink-0" />
      {children}
    </div>
  )
}

/** A stock order's journey as four steps; a cancelled order shows a notice instead. */
export function OrderProgress({ status }: { status: OrderStatus }) {
  if (status === "cancelled") return <CancelledNotice>This order was cancelled.</CancelledNotice>
  const done = stepsDone(status)
  return (
    <ol className="flex items-start" aria-label="Order progress">
      {PROGRESS_STEPS.map((label, i) => {
        const reached = i < done
        return (
          <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
            <div className="flex w-full items-center">
              <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : reached ? "bg-primary" : "bg-border")} />
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                  reached
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground"
                )}
                aria-current={i === done - 1 ? "step" : undefined}
              >
                {reached ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1",
                  i === PROGRESS_STEPS.length - 1 ? "invisible" : i < done - 1 ? "bg-primary" : "bg-border"
                )}
              />
            </div>
            <span className={cn("truncate text-xs", reached ? "font-medium text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
