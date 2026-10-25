// Mirrors api/v1/admin/coupons/serializers.py and api/v1/admin/marketing/serializers.py (kull-mart).

export type DiscountType = "percentage" | "fixed"

export interface NamedRef {
  id: string
  name: string
}

/** CouponSerializer (read). Decimals arrive as strings. */
export interface Coupon {
  id: string
  code: string
  discount_type: DiscountType
  value: string
  min_order_amount: string
  usage_limit: number | null
  per_customer_limit: number | null
  max_discount_amount: string | null
  times_used: number
  starts_at: string | null
  expires_at: string | null
  categories: NamedRef[]
  brands: NamedRef[]
  is_active: boolean
  show_on_storefront: boolean
  created_at: string
  deleted_at: string | null
}

export type ReferralStatus = "pending" | "rewarded" | "void"

export interface Referral {
  id: string
  status: ReferralStatus
  referrer_name: string
  referrer_contact: string
  order_id: string
  order_number: string
  reward_amount: string
  reward_coupon_code: string | null
  rewarded_at: string | null
  created_at: string
}

/** CouponCreateSerializer — note: no is_active (new coupons start active). */
export interface CouponCreatePayload {
  code: string
  discount_type?: DiscountType
  value: string
  min_order_amount?: string
  usage_limit?: number | null
  per_customer_limit?: number | null
  max_discount_amount?: string | null
  starts_at?: string | null
  expires_at?: string | null
  category_ids?: string[]
  brand_ids?: string[]
  show_on_storefront?: boolean
}

/** CouponUpdateSerializer (PATCH, all optional). */
export type CouponUpdatePayload = Partial<CouponCreatePayload> & { is_active?: boolean }

export type SaleTarget = "all" | "categories" | "brands" | "products"
export type SaleStatus = "scheduled" | "running" | "ended" | "off"

export interface Sale {
  id: string
  name: string
  percent_off: string
  starts_at: string
  ends_at: string | null
  is_active: boolean
  applies_to: SaleTarget
  status: SaleStatus
  categories: NamedRef[]
  brands: NamedRef[]
  products: NamedRef[]
}

export interface SalePayload {
  name: string
  percent_off: string
  starts_at: string | null
  ends_at: string | null
  is_active: boolean
  applies_to: SaleTarget
  category_ids: string[]
  brand_ids: string[]
  product_ids: string[]
}

/** AdminNewsletterSubscriberSerializer */
export interface NewsletterSubscriber {
  id: string
  email: string
  is_active: boolean
  unsubscribed_at: string | null
  created_at: string
}

export type CampaignStatus = "draft" | "scheduled" | "sending" | "sent" | "cancelled"
export type DeliveryStatus = "pending" | "sending" | "sent" | "failed" | "skipped"

export type CampaignChannel = "email" | "sms"

/** AdminCampaignSerializer. `delivery_counts.sent` means accepted by the mail server or SMS provider, not delivered. */
export interface EmailCampaign {
  id: string
  name: string
  channel: CampaignChannel
  subject: string
  body: string
  status: CampaignStatus
  scheduled_at: string | null
  started_at: string | null
  finished_at: string | null
  cancelled_at: string | null
  recipient_count: number
  delivery_counts: Record<DeliveryStatus, number>
  created_by_id: string | null
  created_at: string
  updated_at: string
}

/** AdminCampaignWriteSerializer (POST creates a draft; PATCH edits a draft). */
export interface EmailCampaignPayload {
  name: string
  channel?: CampaignChannel
  subject: string
  body: string
}

/** AdminCampaignDeliverySerializer — one recipient's copy. */
export interface CampaignDelivery {
  id: string
  email: string
  phone: string
  status: DeliveryStatus
  attempts: number
  failure_reason: string
  sent_at: string | null
  updated_at: string
}

/** AdminAudienceSerializer — who the next campaign would reach. */
export interface CampaignAudience {
  active_subscribers: number
  eligible_recipients: number
  suppressed_addresses: number
  sms_eligible_recipients: number
  sms_footer_length: number
}

/** AdminCampaignTestResultSerializer. `accepted` means the mail server took it. */
export interface CampaignTestResult {
  accepted: boolean
  reason: string
  recipient: string
}

export type SuppressionReason = "unsubscribed" | "bounced" | "manual"

/** AdminSuppressionSerializer — an address no campaign is sent to. */
export interface EmailSuppression {
  id: string
  email: string
  reason: SuppressionReason
  note: string
  created_at: string
}
