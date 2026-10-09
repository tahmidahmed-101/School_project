const STATUS_KEYS = {
  awaiting_payment: "orderStatusAwaitingPayment",
  confirmed: "orderStatusConfirmed",
  shipped: "orderStatusShipped",
  delivered: "orderStatusDelivered",
  closed: "orderStatusClosed",
  cancelled: "orderStatusCancelled",
} as const;

export type OrderStatusKey = (typeof STATUS_KEYS)[keyof typeof STATUS_KEYS];

/** Dictionary key for an order status, or null for one this storefront has no copy for yet. */
export function orderStatusKey(status: string): OrderStatusKey | null {
  return Object.hasOwn(STATUS_KEYS, status) ? STATUS_KEYS[status as keyof typeof STATUS_KEYS] : null;
}

/** "partially_refunded" -> "Partially refunded": readable fallback for a status without a translation. */
export function humanizeStatus(status: string): string {
  const words = status.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Colour treatment for the status pill. */
export function orderStatusTone(status: string): "done" | "bad" | "progress" {
  if (status === "delivered" || status === "closed") return "done";
  if (status === "cancelled") return "bad";
  return "progress";
}

export function preorderStageTone(stage: string): "done" | "bad" | "progress" {
  if (stage === "completed") return "done";
  if (stage === "cancelled") return "bad";
  return "progress";
}
