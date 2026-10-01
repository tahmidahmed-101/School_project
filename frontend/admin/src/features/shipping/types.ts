// Mirrors kull-mart:
//  - api/v1/admin/orders/serializers.py → ShipmentSerializer / CreateShipmentSerializer
//  - api/v1/admin/logistics/serializers.py → Carrier*, ShippingZone*, ShippingRate*
//  - apps/orders/models/shipment.py (Shipment.Status), apps/logistics/models/carrier.py (Carrier.Provider)

export type ShipmentStatus =
  | "pending"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned"
  | "cancelled"

export interface Shipment {
  id: string
  order_id: string
  carrier_id: string | null
  carrier_name: string | null
  tracking_number: string
  status: ShipmentStatus
  shipping_charge: string
  cod_amount: string
  courier_status: string
  shipped_at: string | null
  delivered_at: string | null
}

export const SHIPMENT_STATUS_OPTIONS: { label: string; value: ShipmentStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Shipped", value: "shipped" },
  { label: "In transit", value: "in_transit" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Delivered", value: "delivered" },
  { label: "Failed", value: "failed" },
  { label: "Returned", value: "returned" },
  { label: "Cancelled", value: "cancelled" },
]

/** Shipment.TERMINAL_STATUSES — no further status changes are accepted. */
export const TERMINAL_SHIPMENT_STATUSES: ShipmentStatus[] = ["delivered", "returned", "cancelled"]

// services/shipments.py _PROGRESSION_RANK: these four may only move forward.
const PROGRESSION_RANK: Partial<Record<ShipmentStatus, number>> = {
  pending: 0,
  shipped: 1,
  in_transit: 2,
  out_for_delivery: 3,
}

/** Statuses the backend will accept as the next status (can_advance_shipment_status). */
export function nextShipmentStatuses(current: ShipmentStatus): ShipmentStatus[] {
  if (TERMINAL_SHIPMENT_STATUSES.includes(current)) return []
  const currentRank = PROGRESSION_RANK[current]
  return SHIPMENT_STATUS_OPTIONS.map((o) => o.value).filter((status) => {
    if (status === current) return false
    const rank = PROGRESSION_RANK[status]
    if (currentRank === undefined || rank === undefined) return true
    return rank >= currentRank
  })
}

/** POST /admin/orders/{id}/shipments/ */
export interface CreateShipmentPayload {
  carrier_id?: string | null
  tracking_number?: string
  shipping_charge?: string
  cod_amount?: string
  lines: { order_line_id: string; quantity: number }[]
}

// ---- Carriers ----

export type CarrierProvider = "pathao" | "steadfast" | "redx" | "manual"

export const CARRIER_PROVIDER_OPTIONS: { label: string; value: CarrierProvider }[] = [
  { label: "Pathao", value: "pathao" },
  { label: "Steadfast", value: "steadfast" },
  { label: "RedX", value: "redx" },
  { label: "Manual / Other", value: "manual" },
]

export interface Carrier {
  id: string
  name: string
  code: CarrierProvider
  phone: string
  contact_email: string
  api_base_url: string
  is_integration_enabled: boolean
  /** True when an API key is stored; the key itself is write-only. */
  has_api_key: boolean
  /** Names of stored config entries; values are secrets and never returned. */
  config_keys: string[]
  is_active: boolean
  deleted_at: string | null
}

/** CarrierCreateSerializer / CarrierUpdateSerializer (secrets are write-only). */
export interface CarrierPayload {
  name?: string
  code?: CarrierProvider
  phone?: string
  contact_email?: string
  api_base_url?: string
  api_key?: string
  api_secret?: string
  webhook_secret?: string
  is_integration_enabled?: boolean
  is_active?: boolean
  config?: Record<string, string>
}

// ---- Zones & rates ----

export interface ShippingRate {
  id: string
  zone_id: string
  carrier_id: string
  base_weight: string
  base_charge: string
  increment_weight: string
  increment_charge: string
}

export interface ShippingZone {
  id: string
  name: string
  /** Area keywords matched against the ship-to address (despite the name, not ISO codes). */
  country_codes: string[]
  is_active: boolean
  deleted_at: string | null
  rates: ShippingRate[]
}

export interface ShippingZonePayload {
  name?: string
  country_codes?: string[]
  is_active?: boolean
}

export interface ShippingRatePayload {
  base_weight: string
  base_charge: string
  increment_weight: string
  increment_charge: string
}
