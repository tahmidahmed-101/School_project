export type StatusTone = "success" | "warning" | "destructive" | "info" | "secondary"

/**
 * Canonical status-key -> tone map, shared across every domain in the app
 * (orders, payments, returns, reviews, notifications, shipments, campaigns,
 * reservations, products, expenses, and every active/inactive or
 * published/draft boolean). Add new keys here rather than inventing a new
 * local color map in a feature file — that's how 18 divergent status pills
 * happened in the first place.
 *
 * Where a word means the same thing everywhere (e.g. "active", "pending",
 * "failed"), it gets one tone. A couple of words meant different things in
 * different files before this consolidation (e.g. "draft" was amber for
 * products but gray for campaigns/shipments, "cancelled" was gray for
 * payments but red for orders/shipments) — those were normalized to one
 * canonical tone here rather than kept ambiguous.
 */
const STATUS_TONES: Record<string, StatusTone> = {
  // generic booleans (active/inactive, published/draft)
  active: "success",
  inactive: "destructive",
  enabled: "success",
  disabled: "destructive",
  published: "success",
  draft: "secondary",
  archived: "secondary",

  // order fulfillment (kull-mart: pending, awaiting_payment, confirmed, shipped,
  // delivered, cancelled, closed)
  awaiting_payment: "warning",
  confirmed: "info",
  closed: "secondary",
  pending_payment: "secondary",
  placed: "info",
  processing: "info",
  shipped: "success",
  delivered: "success",
  cancelled: "destructive",

  // payment / order payment_status / expense status
  captured: "success",
  paid: "success",
  succeeded: "success",
  pending: "warning",
  failed: "destructive",
  partially_refunded: "warning",
  refunded: "info",

  // returns (RMA status + line condition grading)
  requested: "warning",
  received: "info",
  sellable: "success",
  damaged: "destructive",
  pending_review: "warning",
  approved: "success",
  rejected: "destructive",
  replaced: "success",
  completed: "success",

  // reviews / notifications / shipments
  sent: "success",
  booked: "success",
  in_transit: "info",
  out_for_delivery: "info",
  returned: "secondary",

  // campaigns
  scheduled: "info",
  ended: "destructive",

  // reservations
  consumed: "info",
  released: "secondary",
  expired: "destructive",
}

/** Representative solid hex per tone, for contexts that need a literal color (e.g. recharts fill) rather than a Tailwind class. */
export const STATUS_TONE_HEX: Record<StatusTone, string> = {
  success: "#22c55e",
  warning: "#eab308",
  destructive: "#ef4444",
  info: "#3b82f6",
  secondary: "#6b7280",
}

export function getStatusTone(status: string | null | undefined, fallback: StatusTone = "secondary"): StatusTone {
  if (!status) return fallback
  return STATUS_TONES[status.toLowerCase()] ?? fallback
}
