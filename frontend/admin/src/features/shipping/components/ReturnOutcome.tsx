import { RECEIVABLE_BACK_STATUSES, type Shipment } from "@/features/shipping/types"

/**
 * Where a returned or cancelled consignment stands: still to be received back, received, or
 * received with damaged units the customer is still owed. Renders nothing for other shipments.
 */
export function ReturnOutcome({ shipment }: { shipment: Shipment }) {
  if (!RECEIVABLE_BACK_STATUSES.includes(shipment.status)) return null

  const owed = shipment.unresolved_damaged_quantity ?? 0
  if (!shipment.received_back_at) {
    return <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Not received back yet</span>
  }
  if (owed > 0) {
    return (
      <span className="text-xs font-medium text-destructive">
        {owed} damaged unit{owed === 1 ? "" : "s"} owed
      </span>
    )
  }
  return <span className="text-xs text-muted-foreground">Received back</span>
}
