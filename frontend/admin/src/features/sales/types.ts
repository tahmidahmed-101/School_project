// Mirrors school-project api/v1/admin/orders/serializers.py → AdminSalesOrderSerializer and friends.
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

export interface OrderRisk {
  risk_level: "low" | "medium" | "high"
  risk_score: string
  risk_reasons: string[]
  recommended_action: string
  auto_blocked: boolean
  guidance: string
}

export const ORDER_STATUS_OPTIONS: { label: string; value: OrderStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Awaiting payment", value: "awaiting_payment" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Shipped", value: "shipped" },
  { label: "Delivered", value: "delivered" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Closed", value: "closed" },
]

/** services/orders.py — cancel_order and line edits only work before anything ships. */
export const PRE_SHIPMENT_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "confirmed"]
/** services/returns.py NON_RETURNABLE_ORDER_STATUSES. */
export const NON_RETURNABLE_STATUSES: OrderStatus[] = ["pending", "awaiting_payment", "cancelled"]

export interface OrderLine {
  id: string
  variant_id: string
  variant_sku: string
  /** The variant's options when the line was added, e.g. "Red / M"; "" without options. */
  variant_title?: string
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
  subtotal: string
  tax_total: string
  shipping_total: string
  discount_total: string
  grand_total: string
  /** Money received and not refunded; uncollected cash on delivery is not in it. */
  paid_total: string
  balance_due: string
  /** Statuses the manual override accepts from here (services/orders.py STATUS_OVERRIDES). */
  allowed_statuses: OrderStatus[]
  coupon_code: string | null
  created_at: string
  lines: OrderLine[]
  payments: Payment[]
  shipments: Shipment[]
  rmas: Rma[]
  /** The latest fraud assessment, null when the order was never scored. */
  risk: OrderRisk | null
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
