// Mirrors kull-mart api/v1/admin/orders/serializers.py → AdminPaymentSerializer.
// apps/orders/models/payment.py (Payment.Status) and apps/orders/constants.py (PaymentMethodKey).

export type PaymentStatus = "pending" | "captured" | "failed" | "refunded"

export type PaymentMethod =
  | "cash"
  | "cod"
  | "card"
  | "bkash"
  | "nagad"
  | "rocket"
  | "bank_transfer"
  | "manual"

/** @deprecated Old name kept for importers outside this domain; use PaymentMethod. */
export type PaymentProvider = PaymentMethod

export interface Payment {
  id: string
  order_id: string
  order_number: string
  amount: string
  refunded_amount: string
  method: PaymentMethod
  status: PaymentStatus
  gateway_reference: string
}

export const PAYMENT_STATUS_OPTIONS: { label: string; value: PaymentStatus }[] = [
  { label: "Pending", value: "pending" },
  { label: "Captured", value: "captured" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
]

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  cod: "Cash on delivery",
  card: "Card",
  bkash: "bKash",
  nagad: "Nagad",
  rocket: "Rocket",
  bank_transfer: "Bank transfer",
  manual: "Manual / other",
}

export const PAYMENT_METHOD_OPTIONS = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
  (value) => ({ value, label: PAYMENT_METHOD_LABELS[value] })
)

/**
 * Methods without a live gateway need a reference (TrxID, slip no.) to be captured
 * (PaymentMethodSpec.requires_reference); cash/cod/manual are attested in person.
 */
export const METHODS_WITHOUT_REFERENCE: PaymentMethod[] = ["cash", "cod", "manual"]

export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—"
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method
}
