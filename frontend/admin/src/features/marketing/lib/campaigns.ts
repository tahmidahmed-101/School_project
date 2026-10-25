import type { StatusTone } from "@/components/common/status-tones"
import { SMTP_FAILURE_REASONS } from "@/lib/smtpReasons"
import type { CampaignChannel, CampaignStatus, DeliveryStatus, EmailCampaign, SuppressionReason } from "../types"

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
}

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, StatusTone> = {
  draft: "secondary",
  scheduled: "info",
  sending: "warning",
  sent: "success",
  cancelled: "destructive",
}

export const DELIVERY_STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "Waiting",
  sending: "Sending",
  sent: "Accepted",
  failed: "Failed",
  skipped: "Skipped",
}

export const DELIVERY_STATUS_TONE: Record<DeliveryStatus, StatusTone> = {
  pending: "secondary",
  sending: "info",
  sent: "success",
  failed: "destructive",
  skipped: "warning",
}

export const SUPPRESSION_REASON_LABEL: Record<SuppressionReason, string> = {
  unsubscribed: "Unsubscribed",
  bounced: "Refused by the mail server",
  manual: "Blocked by staff",
}

export const SUPPRESSION_REASON_TONE: Record<SuppressionReason, StatusTone> = {
  unsubscribed: "secondary",
  bounced: "destructive",
  manual: "warning",
}

export const CAMPAIGN_CHANNEL_LABEL: Record<CampaignChannel, string> = {
  email: "Email",
  sms: "SMS",
}

// Why a copy was skipped (campaigns.py) or failed (the SMTP and SMS codes).
const DELIVERY_REASONS: Record<string, string> = {
  ...SMTP_FAILURE_REASONS,
  recipient_refused: "The mail server or SMS provider refused the recipient.",
  not_configured: "SMS sending isn't set up on the server.",
  no_recipient: "There was no valid phone number to send to.",
  provider_error: "The SMS provider rejected the message.",
  network_error: "Couldn't reach the SMS provider.",
  cancelled: "The campaign was cancelled before this copy went out.",
  suppressed: "The address was blocked after the campaign started.",
  unsubscribed: "The subscriber unsubscribed after the campaign started.",
  unexpected_error: "Something went wrong while sending.",
}

export const deliveryReason = (code: string) => (code ? (DELIVERY_REASONS[code] ?? code.replace(/_/g, " ")) : "")

/** Copies still to go out: waiting or being sent right now. */
export const copiesLeft = (campaign: EmailCampaign) =>
  campaign.delivery_counts.pending + campaign.delivery_counts.sending
