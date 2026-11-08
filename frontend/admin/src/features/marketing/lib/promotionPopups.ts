import type { StatusTone } from "@/components/common/status-tones"
import type { PopupDisplayStatus, PromotionPopup } from "@/features/system/types"
import { formatDateTime } from "@/lib/format"

export const POPUP_STATUS_TONES: Record<PopupDisplayStatus, StatusTone> = {
  inactive: "secondary",
  scheduled: "info",
  active: "success",
  expired: "destructive",
}

/** Where clicking the popup goes, for the table. */
export function destinationLabel(popup: PromotionPopup): string {
  switch (popup.destination_type) {
    case "product":
      return popup.product ? `Product: ${popup.product.name}` : "Product (removed)"
    case "category":
      return popup.category ? `Category: ${popup.category.name}` : "Category (removed)"
    case "campaign":
      return popup.sale ? `Campaign: ${popup.sale.name}` : "Campaign (removed)"
    case "url":
      return popup.link_url
    default:
      return "No link"
  }
}

/** The schedule in one line: both ends, one end, or "Always" when neither is set. */
export function scheduleLabel(popup: PromotionPopup): string {
  const { starts_at: starts, ends_at: ends } = popup
  if (starts && ends) return `${formatDateTime(starts)} – ${formatDateTime(ends)}`
  if (starts) return `From ${formatDateTime(starts)}`
  if (ends) return `Until ${formatDateTime(ends)}`
  return "Always"
}
