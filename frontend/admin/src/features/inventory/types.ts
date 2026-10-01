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

/** AdminStockLookupView: StockLookupVariantSerializer + found, or { found: false, query }. */
export type StockLookupResult =
  | {
      found: true
      variant_id: string
      product_id: string
      product_name: string
      sku: string
      barcode: string
      price: string
      cost_price: string
      available: number
    }
  | { found: false; query: string }

/** StockAdjustmentSerializer */
export interface StockAdjustmentPayload {
  variant_id: string
  warehouse_id?: string | null
  quantity_delta: number
  unit_cost?: string | null
  notes?: string
}

/** StockWriteOffSerializer */
export interface StockWriteOffPayload {
  variant_id: string
  warehouse_id?: string | null
  quantity: number
  reason?: string
}

/** StockIntakeSerializer */
export interface StockIntakePayload {
  variant_id: string
  warehouse_id?: string | null
  quantity: number
  unit_cost?: string | null
  notes?: string
}

/** QuickProductCreateSerializer */
export interface QuickProductPayload {
  category_id: string
  name: string
  sku: string
  price: string
  cost_price?: string
  barcode?: string
  description?: string
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
