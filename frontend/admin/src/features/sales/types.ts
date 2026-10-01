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
  customer_id: string
  customer_email: string
  customer_name: string
  customer_phone: string
  status: OrderStatus
  shipping_address_id: string | null
  shipping_address: OrderShippingAddress | null
  notes: string
  contact_email: string
  contact_phone: string
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

/** @deprecated List rows are full orders now; kept for importers outside this domain. */
export type OrderListItem = Order
/** @deprecated Same shape as Order. */
export type OrderDetail = Order

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
