// Mirrors api/v1/admin/coupons/serializers.py and api/v1/admin/marketing/serializers.py (kull-mart).

export type DiscountType = "percentage" | "fixed"

/** CouponSerializer (read). Decimals arrive as strings. */
export interface Coupon {
  id: string
  code: string
  discount_type: DiscountType
  value: string
  min_order_amount: string
  usage_limit: number | null
  times_used: number
  expires_at: string | null
  is_active: boolean
  show_on_storefront: boolean
  created_at: string
  deleted_at: string | null
}

/** CouponCreateSerializer — note: no is_active (new coupons start active). */
export interface CouponCreatePayload {
  code: string
  discount_type?: DiscountType
  value: string
  min_order_amount?: string
  usage_limit?: number | null
  expires_at?: string | null
  show_on_storefront?: boolean
}

/** CouponUpdateSerializer (PATCH, all optional). */
export type CouponUpdatePayload = Partial<CouponCreatePayload> & { is_active?: boolean }

/** AdminNewsletterSubscriberSerializer */
export interface NewsletterSubscriber {
  id: string
  email: string
  is_active: boolean
  unsubscribed_at: string | null
  created_at: string
}
