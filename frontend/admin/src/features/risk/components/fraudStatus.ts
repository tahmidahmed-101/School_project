import type { StatusTone } from "@/components/common/status-tones"
import type { FraudCaseStatus } from "../types"

export const fraudStatusTone: Record<FraudCaseStatus, StatusTone> = {
  new: "warning",
  under_review: "info",
  resolved: "success",
}
