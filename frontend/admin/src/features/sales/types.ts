// Mirrors kull-mart api/v1/admin/orders/serializers.py → AdminSalesOrderSerializer and friends.
// apps/orders/models/sales_order.py (SalesOrder.Status). List and detail share one serializer.

import type { Payment, PaymentMethod } from "@/features/payments/types"
import type { Rma } from "@/features/returns/types"
import type { Shipment } from "@/features/shipping/types"

export type OrderStatus =
  | "pending"
  | "awaiting_payment"
  | "confirmed"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "closed"

export const ORDER_STATUS_OPTIONS: { label: string; value: OrderStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Awaiting payment", value: "awaiting_payment" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Closed", value: "closed" },
]

/** Where a pre-order is on its way; set by hand, separate from the order status (backend `PreorderStage`). */
export const PREORDER_STAGE_OPTIONS: { label: string; value: string }[] = [
  { label: "Pending payment", value: "pending_payment" },
  { label: "Partially paid", value: "partially_paid" },
  { label: "Purchasing", value: "purchasing" },
  { label: "Purchase completed", value: "purchase_completed" },
  { label: "Shipped from supplier", value: "shipped_from_supplier" },
  { label: "Received in China warehouse", value: "received_in_china_warehouse" },
  { label: "On the way to China airport", value: "on_the_way_to_china_airport" },
  { label: "Received in China airport", value: "received_in_china_airport" },
  { label: "On the way to BD airport", value: "on_the_way_to_bd_airport" },
  { label: "Received in BD airport", value: "received_in_bd_airport" },
  { label: "On the way to China seaport", value: "on_the_way_to_china_seaport" },
  { label: "Received in China seaport", value: "received_in_china_seaport" },
  { label: "On the way to BD seaport", value: "on_the_way_to_bd_seaport" },
  { label: "Received in BD seaport", value: "received_in_bd_seaport" },
  { label: "Offload", value: "offload" },
  { label: "Inspection", value: "inspection" },
  { label: "On the way to BD warehouse", value: "on_the_way_to_bd_warehouse" },
  { label: "Received in BD warehouse", value: "received_in_bd_warehouse" },
  { label: "Waiting for receive due payment", value: "waiting_for_receive_due_payment" },
  { label: "Processing for delivery", value: "processing_for_delivery" },
  { label: "On the way to delivery", value: "on_the_way_to_delivery" },
  { label: "Completed", value: "completed" },
  { label: "Hold", value: "hold" },
  { label: "Cancelled", value: "cancelled" },
]

export const preorderStageLabel = (stage: string) =>
  PREORDER_STAGE_OPTIONS.find((o) => o.value === stage)?.label ?? stage

export interface PreorderStageEvent {
  stage: string
  note: string
  changed_by_name: string | null
  created_at: string
}

/** services/orders.py — cancel_order and line edits only work before anything ships. */
export const PRE_SHIPMENT_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "confirmed"]
/** services/returns.py NON_RETURNABLE_ORDER_STATUSES. */
export const NON_RETURNABLE_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "cancelled"]

export interface OrderLine {
  id: string
  variant_id: string
  variant_sku: string
  product_name: string
  product_image: string | null
  quantity: number
  shipped_quantity: number
  /** Units in DELIVERED consignments (selectors/shipments.py delivered_quantity_sum). */
  delivered_quantity: number
  returned_quantity: number
  shippable_quantity: number
  returnable_quantity: number
  unit_price: string
  discount_amount: string
  tax_amount: string
}

/** The order's ship-to snapshot (`line2` is exposed as `delivery_note`). */
export interface OrderShippingAddress {
  id: string | null
  full_name: string
  phone: string
  line1: string
  delivery_note: string
  postal_code: string
  country: string
}

export interface Order {
  id: string
  order_number: string
  /** Null only on an anonymous guest cart (a pending order nobody has checked out yet). */
  customer_id: string | null
  customer_email: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  shipping_address_id: string | null
  shipping_address: OrderShippingAddress | null
  notes: string
  contact_email: string
  contact_phone: string
  contact_name: string
  has_preorder: boolean
  /** Blank until staff record the first stage. */
  preorder_stage: string
  preorder_stage_events: PreorderStageEvent[]
  subtotal: string
  tax_total: string
  shipping_total: string
  discount_total: string
  grand_total: string
  coupon_code: string | null
  created_at: string
  lines: OrderLine[]
  payments: Payment[]
  shipments: Shipment[]
  rmas: Rma[]
}

/** PATCH /admin/orders/{id}/ (AdminOrderUpdateSerializer) — correctable fields only. */
export interface OrderUpdatePayload {
  shipping_address_id?: string | null
  notes?: string
  contact_email?: string
  contact_phone?: string
  full_name?: string
  phone?: string
  line1?: string
  delivery_note?: string
  postal_code?: string
  country?: string
}

/** POST /admin/orders/ (AdminOrderCreateSerializer). */
export interface OrderCreatePayload {
  customer_id: string
  shipping_address_id?: string | null
  carrier_id?: string | null
  lines: { variant_id: string; quantity: number }[]
  capture_payment?: boolean
  payment_method?: PaymentMethod
}

/** AdminCartItemSerializer — a cart line's product name and SKU snapshots. */
export interface CustomerCartItem {
  id: string
  variant_id: string
  product_name: string
  sku: string
  quantity: number
  unit_price: string
  is_preorder: boolean
}

/**
 * GET /admin/orders/carts/ (AdminCustomerCartSerializer) — an open, non-empty cart.
 * A guest cart has no customer, so its customer fields are null.
 */
export interface CustomerCart {
  id: string
  is_guest_cart: boolean
  customer_id: string | null
  customer_email: string | null
  customer_name: string | null
  customer_phone: string | null
  /** True once a phone was typed at checkout: the shopper got that far and left. */
  reached_checkout: boolean
  items: CustomerCartItem[]
  item_count: number
  subtotal: string
  created_at: string
  /** The last cart change: every line edit saves the cart. */
  updated_at: string
}
