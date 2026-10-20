import type { ComponentType } from "react"
import { Ban, BadgeCheck, Bike, CircleCheck, ClipboardList, Package, RotateCcw, TriangleAlert, Truck } from "lucide-react"

import type { Order } from "@/features/sales/types"
import type { Shipment } from "@/features/shipping/types"
import { humanize } from "@/lib/format"
import { cn } from "@/lib/utils"

type StepIcon = ComponentType<{ className?: string }>

const PATH: { label: string; icon: StepIcon }[] = [
  { label: "Placed", icon: ClipboardList },
  { label: "Confirmed", icon: BadgeCheck },
  { label: "Shipped", icon: Package },
  { label: "In transit", icon: Truck },
  { label: "Out for delivery", icon: Bike },
  { label: "Delivered", icon: CircleCheck },
]

/** Steps a shipment has completed, by its own status. */
const SHIPMENT_DONE: Partial<Record<Shipment["status"], number>> = {
  pending: 2,
  shipped: 3,
  in_transit: 4,
  out_for_delivery: 5,
  delivered: 6,
}

interface Strip {
  done: number
  /** Where the order left the normal path, with how many steps it had passed. */
  exit?: { label: string; icon: StepIcon }
}

function stripFor(order: Order): Strip {
  const live = order.shipments.filter((s) => s.status !== "cancelled")
  if (order.status === "cancelled") return { done: 1, exit: { label: "Cancelled", icon: Ban } }
  if (live.length > 0 && live.every((s) => s.status === "returned")) {
    return { done: 4, exit: { label: "Returned", icon: RotateCcw } }
  }
  if (live.some((s) => s.status === "failed")) return { done: 4, exit: { label: "Delivery failed", icon: TriangleAlert } }
  if (order.status === "delivered" || order.status === "closed") return { done: PATH.length }
  if (order.status === "shipped" && live.length > 0) {
    return { done: Math.min(...live.map((s) => SHIPMENT_DONE[s.status] ?? 3)) }
  }
  if (order.status === "shipped") return { done: 3 }
  if (order.status === "confirmed") return { done: 2 }
  return { done: 1 }
}

export function CancelledNotice({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm font-medium text-destructive">
      <Ban className="size-4 shrink-0" />
      {children}
    </div>
  )
}

/** The courier's own words for where each parcel is, e.g. "Steadfast · In review". */
function courierLines(order: Order): string[] {
  return order.shipments
    .filter((s) => s.courier_status && s.status !== "delivered")
    .map((s) => [s.carrier_name, humanize(s.courier_status)].filter(Boolean).join(" · "))
}

/** A stock order's journey from placed to delivered, as a plain strip over the whole page width. */
export function OrderProgress({ order }: { order: Order }) {
  const { done, exit } = stripFor(order)
  const awaitingPayment = order.status === "awaiting_payment" || order.status === "pending"
  const steps = [
    ...PATH.map((step, i) => ({
      label: i === 0 && awaitingPayment ? "Awaiting payment" : step.label,
      icon: step.icon,
      state: i < done ? (i === done - 1 && !exit && done < PATH.length ? "current" : "done") : "todo",
    })),
    ...(exit ? [{ label: exit.label, icon: exit.icon, state: "exit" }] : []),
  ]
  const lines = courierLines(order)

  return (
    <div className="space-y-2">
      <ol className="flex w-full items-start" aria-label="Order progress">
        {steps.map((step, i) => {
          const Icon = step.icon
          const reached = step.state === "done" || step.state === "current"
          const last = i === steps.length - 1
          return (
            <li key={step.label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
              <div className="flex w-full items-center">
                <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : i < done ? "bg-primary" : "bg-border")} />
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
                    reached && "border-primary bg-primary text-primary-foreground",
                    step.state === "current" && "ring-4 ring-primary/20",
                    step.state === "todo" && "border-border bg-card text-muted-foreground",
                    step.state === "exit" && "border-destructive bg-destructive text-destructive-foreground"
                  )}
                  aria-current={step.state === "current" || step.state === "exit" ? "step" : undefined}
                >
                  <Icon className="size-4" />
                </span>
                <span className={cn("h-0.5 flex-1", last ? "invisible" : i < done - 1 ? "bg-primary" : "bg-border")} />
              </div>
              {/* Each label keeps to its own column. On phones only the step the order is at
                  is named, so six labels never crowd into each other. */}
              <span
                className={cn(
                  "w-full truncate px-0.5 text-xs",
                  step.state !== "current" && step.state !== "exit"
                    ? "max-sm:invisible"
                    : "max-sm:w-max max-sm:overflow-visible",
                  step.state === "exit" ? "font-medium text-destructive" : reached || step.state === "current" ? "font-medium text-foreground" : "text-muted-foreground"
                )}
                title={step.label}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>
      {lines.length > 0 && <p className="text-center text-xs capitalize text-muted-foreground">{lines.join("  ·  ")}</p>}
    </div>
  )
}
