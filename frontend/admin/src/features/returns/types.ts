// Mirrors kull-mart api/v1/admin/orders/serializers.py → AdminRMASerializer / AdminRMALineSerializer.
// apps/orders/models/return_rma.py (ReturnRMA.Status, ReturnRMALine.Condition).

export type RmaStatus = "requested" | "approved" | "rejected" | "received" | "closed"

/** "" until staff grade the line after it physically arrives. */
export type RmaCondition = "" | "sellable" | "damaged"

export interface RmaLine {
  id: string
  order_line_id: string
  quantity: number
  condition: RmaCondition
}

export interface Rma {
  id: string
  rma_number: string
  order_id: string
  status: RmaStatus
  reason: string
  lines: RmaLine[]
}

export const RMA_STATUS_OPTIONS: { label: string; value: RmaStatus }[] = [
  { label: "Requested", value: "requested" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
  { label: "Received", value: "received" },
  { label: "Closed", value: "closed" },
]

/** POST /admin/orders/{id}/returns/ (CreateRMASerializer). */
export interface CreateRmaPayload {
  reason?: string
  lines: { order_line_id: string; quantity: number }[]
}
