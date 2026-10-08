import { toNumber } from "@/lib/api/parse";
import type { ApiOrder } from "@/lib/api/types";
import type { OrderResult } from "@/lib/types";

/** Backend order -> what the order-success screen shows. */
export function toOrderResult(
  order: ApiOrder,
  customer: { name: string; address: string; district: string },
  payTo: string,
): OrderResult {
  return {
    orderNumber: order.order_number,
    status: order.status,
    customerName: customer.name,
    email: order.contact_email,
    phone: order.contact_phone,
    address: customer.address,
    district: customer.district,
    lines: order.lines.map((line) => ({
      id: line.id,
      name: line.product_name,
      sku: line.variant_sku,
      quantity: line.quantity,
      unitPrice: toNumber(line.unit_price),
      total: toNumber(line.total),
      isPreOrder: line.is_preorder,
    })),
    subtotal: toNumber(order.subtotal),
    tax: toNumber(order.tax_total),
    shipping: toNumber(order.shipping_total),
    discount: toNumber(order.discount_total),
    total: toNumber(order.grand_total),
    isPreOrderOrder: order.order_type === "preorder",
    depositDue: toNumber(order.deposit_due),
    payTo,
    couponCode: order.coupon_code,
    shipments: order.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier_name,
      trackingNumber: s.tracking_number,
      status: s.status,
    })),
  };
}
