// Mirrors api/v1/admin/risk/serializers.py (kull-mart).

export type FraudCaseStatus = "new" | "under_review" | "resolved"

/** FraudCaseSerializer */
export interface FraudCase {
  id: string
  case_number: string
  status: FraudCaseStatus
  order_id: string | null
  customer_id: string | null
  description: string
  resolution: string
  resolution_notes: string
  resolved_at: string | null
  created_at: string
}

/** ResolveFraudCaseSerializer */
export interface ResolveFraudCasePayload {
  resolution: string
  resolution_notes?: string
}

/** IPBlockSerializer */
export interface IPBlock {
  id: string
  ip_address: string
  reason: string
  expires_at: string | null
  is_active: boolean
  created_at: string
}

export interface IPBlockPayload {
  ip_address: string
  reason: string
  expires_at?: string | null
}

export type PhoneBlockStrength = "advance_only" | "blocked"
export type PhoneBlockOrigin = "manual" | "automatic"

/** PhoneBlockSerializer */
export interface PhoneBlock {
  id: string
  phone_number: string
  strength: PhoneBlockStrength
  origin: PhoneBlockOrigin
  reason: string
  is_active: boolean
  lifted_at: string | null
  created_at: string
}

/** BlockPhoneSerializer */
export interface PhoneBlockPayload {
  phone_number: string
  reason: string
  strength?: PhoneBlockStrength
}

export const PHONE_STRENGTH_LABELS: Record<PhoneBlockStrength, string> = {
  advance_only: "Advance payment only",
  blocked: "Refuse all orders",
}
