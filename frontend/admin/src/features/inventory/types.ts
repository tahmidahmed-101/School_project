import type { Kind } from "@/hooks/use-kind"
// Mirrors kull-mart api/v1/admin/inventory/serializers.py and the reservation serializer
// in api/v1/admin/orders/serializers.py (StockReservationSerializer).

export type MovementType =
  | "purchase_in"
  | "return_in"
  | "transfer_in"
  | "adjustment_in"
  | "sales_out"
  | "transfer_out"
  | "adjustment_out"
  | "write_off"

export const movementTypeOptions: { label: string; value: MovementType }[] = [
  { label: "Purchase receipt", value: "purchase_in" },
  { label: "Customer return", value: "return_in" },
  { label: "Transfer in", value: "transfer_in" },
  { label: "Adjustment (+)", value: "adjustment_in" },
  { label: "Sales shipment", value: "sales_out" },
  { label: "Transfer out", value: "transfer_out" },
  { label: "Adjustment (-)", value: "adjustment_out" },
  { label: "Write-off", value: "write_off" },
]

export const movementTypeLabel = (t: string) => movementTypeOptions.find((o) => o.value === t)?.label ?? t

/** WarehouseSerializer */
export interface Warehouse {
  id: string
  name: string
  code: string
  kind: Kind
  address: string
  is_active: boolean
  is_default: boolean
  deleted_at: string | null
  created_at: string
  updated_at: string
}

/** WarehouseCreateSerializer / WarehouseUpdateSerializer */
export interface WarehousePayload {
  name?: string
  code?: string
  kind?: Kind
  address?: string
  is_active?: boolean
  is_default?: boolean
}

/** StockItemSerializer */
export interface StockItem {
  id: string
  variant_id: string
  variant_sku: string
  product_name: string
  product_image: string | null
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  quantity_on_hand: number
  quantity_reserved: number
  available: number
  avg_cost: string
  reorder_point: number
  target_stock_level: number
}

/** StockLedgerEntrySerializer */
export interface StockLedgerEntry {
  id: string
  variant_id: string
  variant_sku: string
  product_name: string
  product_image: string | null
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  movement_type: MovementType
  quantity: number
  unit_cost: string | null
  balance_after: number
  reference_type: string
  reference_id: string | null
  notes: string
  created_by_id: string | null
  created_at: string
}

/** stock_status_summary() */
export interface StockStatusSummary {
  sellable: number
  reserved: number
  in_transit: number
  quarantine: number
  pending_return_inspection: number
  written_off: number
}

/** StockAdjustmentSerializer */
export interface StockAdjustmentPayload {
  variant_id: string
  /** The half the page belongs to; the server refuses a variant of the other half (stock_kind_mismatch). */
  kind?: Kind
  warehouse_id?: string | null
  quantity_delta: number
  unit_cost?: string | null
  notes?: string
}

/** StockWriteOffSerializer */
export interface StockWriteOffPayload {
  variant_id: string
  kind?: Kind
  warehouse_id?: string | null
  quantity: number
  reason?: string
}

/** StockIntakeSerializer */
export interface StockIntakePayload {
  variant_id: string
  kind?: Kind
  warehouse_id?: string | null
  quantity: number
  unit_cost?: string | null
  notes?: string
}

export type ReservationStatus = "active" | "released"

/** StockReservationSerializer (orders app) */
export interface StockReservation {
  id: string
  order_line_id: string
  order_id: string
  order_number: string
  variant_id: string
  variant_sku: string
  product_name: string
  quantity: number
  status: ReservationStatus
  created_at: string
  expires_at: string
  is_expired: boolean
}

/** One row of preorder_demand(): units open pre-orders still wait for, per variant. */
export interface PreorderDemandRow {
  variant_id: string
  variant_sku: string
  product_name: string
  waiting: number
  available: number
  to_buy: number
}

/** AdminPreorderReportView (orders app) */
export interface PreorderReport {
  summary: { open_orders: number; order_value: string; deposits_held: string; balances_outstanding: string }
  demand: PreorderDemandRow[]
}

/** AdminPreorderAllocationView (orders app) */
export interface PreorderAllocationResult {
  allocated: { order_id: string; order_number: string; variant_sku: string; quantity: number }[]
}
