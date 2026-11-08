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
  hidden: "secondary",
  deleted: "destructive",

  // order fulfillment (school-project: pending, awaiting_payment, confirmed, shipped,
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
  unpaid: "warning",
  overdue: "destructive",
  void: "secondary",

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

  // product questions / price-issue reports
  answered: "info",
  open: "warning",
  resolved: "success",
  dismissed: "secondary",
}

/** A feature's own map: the shared tones plus the statuses only that feature has (or means differently). */
export function withStatusTones(overrides: Record<string, StatusTone>): Record<string, StatusTone> {
  return { ...STATUS_TONES, ...overrides }
}

export function getStatusTone(status: string | null | undefined, fallback: StatusTone = "secondary"): StatusTone {
  if (!status) return fallback
  return STATUS_TONES[status.toLowerCase()] ?? fallback
}
