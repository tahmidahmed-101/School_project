import { toNumber } from "@/lib/api/parse";
import type { ApiOrder, ApiShippingQuote } from "@/lib/api/types";
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
      variantTitle: line.variant_title ?? "",
      sku: line.variant_sku,
      quantity: line.quantity,
      unitPrice: toNumber(line.unit_price),
      total: toNumber(line.total),
    })),
    subtotal: toNumber(order.subtotal),
    tax: toNumber(order.tax_total),
    shipping: toNumber(order.shipping_total),
    discount: toNumber(order.discount_total),
    total: toNumber(order.grand_total),
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

export type ShippingQuoteState =
  { status: "idle" } | { status: "loading" } | { status: "ok"; fee: number } | { status: "unavailable" };

/** Delivery quote -> what the summary shows. A free-delivery answer is a fee of 0, which the summary words as "Free". */
export function toShippingQuoteState(quote: ApiShippingQuote): ShippingQuoteState {
  if (quote.free_delivery) return { status: "ok", fee: 0 };
  if (quote.shipping_total === null) return { status: "unavailable" };
  return { status: "ok", fee: Number(quote.shipping_total) };
}
