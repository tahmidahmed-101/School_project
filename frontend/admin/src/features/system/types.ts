// Mirrors api/v1/admin/business/serializers.py (kull-mart), mounted at /admin/settings/.

import type { Kind } from "@/hooks/use-kind"

/** AdminBusinessProfileSerializer */
export interface BusinessProfile {
  name: string
  legal_name: string
  tagline: string
  logo_url: string
  phone: string
  whatsapp: string
  email: string
  website: string
  google_maps_url: string
  opening_hours: string
  address_line: string
  district: string
  thana: string
  postcode: string
  country: string
  formatted_address: string
  currency_code: string
  currency_symbol: string
  tax_id: string
  trade_licence_no: string
  facebook_url: string
  instagram_url: string
  tiktok_url: string
  youtube_url: string
  linkedin_url: string
  preorder_deposit_percent: string
  /** Accepted before placing a pre-order; both "" = none. */
  preorder_terms_en: string
  preorder_terms_bn: string
  free_delivery_min_amount: string | null
  about_en: string
  about_bn: string
  updated_at: string
}

/** AdminBusinessProfileUpdateSerializer — every field optional (PATCH). */
export type BusinessProfileUpdate = Partial<Omit<BusinessProfile, "formatted_address" | "updated_at">>

/** AdminModuleConfigFieldSerializer */
export interface ModuleConfigField {
  key: string
  label: string
  description: string
  value: boolean
}

/** AdminModuleSerializer */
export interface BusinessModule {
  key: string
  label: string
  description: string
  is_licensed: boolean
  is_enabled: boolean
  can_disable: boolean
  locked_reason: string
  depends_on: string[]
  dependents: string[]
  blocking_dependents: string[]
  missing_dependencies: string[]
  permission_codes: string[]
  config_fields: ModuleConfigField[]
}

/** AdminModuleUpdateSerializer — exactly one of the two. */
export type ModuleUpdatePayload = { is_enabled: boolean } | { config: Record<string, boolean> }

/** AdminPaymentMethodSerializer */
export interface PaymentMethodState {
  key: string
  kind: Kind
  label: string
  description: string
  is_enabled: boolean
  pay_to: string
  can_disable: boolean
  locked_reason: string
}

/** AdminIntegrationStatusSerializer */
export interface IntegrationStatus {
  sms: {
    provider: string
    is_configured: boolean
    from_number: string
  }
}

// ---- storefront content (/admin/settings/hero-slides/, /admin/settings/promo-lines/) ----

/** `both` is read-only: rows saved before the split keep it until `split_both_placements` has run. */
export type HeroSlidePlacement = "home" | "preorder" | "both"

/** The placement one settings page edits: `home` on stock Settings, `preorder` on Pre-order Settings. */
export type ShopPlacement = Exclude<HeroSlidePlacement, "both">

export interface HeroSlide {
  id: string
  /** Absolute URL. */
  image: string
  alt_text: string
  tag_en: string
  tag_bn: string
  title_en: string
  title_bn: string
  link_url: string
  placement: HeroSlidePlacement
  sort_order: number
  is_active: boolean
}

export type HeroSlideInput = Omit<HeroSlide, "id" | "image">

export interface PromoLine {
  id: string
  text_en: string
  text_bn: string
  placement: HeroSlidePlacement
  sort_order: number
  is_active: boolean
}

export type PromoLineInput = Omit<PromoLine, "id">

// ---- promotion popups (/admin/settings/promotion-popups/) ----

/** As the storefront sees it: a switched-on popup is scheduled before its start and expired after its end. */
export type PopupDisplayStatus = "inactive" | "scheduled" | "active" | "expired"
/** The shop a popup belongs to: stock popups show on the stock storefront pages, pre-order ones on the pre-order pages. */
export type PopupShop = "stock" | "preorder"
/** `none`: the image alone, with no link. */
export type PopupDestination = "none" | "product" | "category" | "campaign" | "url"

export interface PromotionPopup {
  id: string
  /** Absolute URL. Every popup has one. */
  image: string | null
  created_at: string
  name: string
  /** Switched on; the schedule then decides when it shows. */
  is_active: boolean
  display_status: PopupDisplayStatus
  /** Higher shows first when several popups could show on the same page. */
  priority: number
  /** Null: no limit on that side. */
  starts_at: string | null
  ends_at: string | null
  /** Fixed once created. */
  shop: PopupShop
  destination_type: PopupDestination
  /** Only the one matching `destination_type` is set. */
  /** `image`: the product's main photo, or null. */
  product: { id: string; name: string; slug: string; image: string | null } | null
  category: { id: string; name: string; slug: string; category_type: "stock" | "preorder" } | null
  sale: {
    id: string
    name: string
    percent_off: string
    status: "scheduled" | "running" | "ended" | "off" | "deleted"
  } | null
  /** The custom URL destination: a site path or an http(s) address. */
  link_url: string
}

export interface PromotionPopupInput {
  name: string
  is_active: boolean
  priority: number
  starts_at: string | null
  ends_at: string | null
  /** Sent on create only. */
  shop: PopupShop
  destination_type: PopupDestination
  product_id: string | null
  category_id: string | null
  sale_id: string | null
  link_url: string
}

// ---- store policies (/admin/settings/policies/) ----

export type PolicyKind = "shipping" | "returns" | "refund"

/** POLICY_LOCALES in apps/business/policy_content.py — every piece of policy text exists in each. */
export type PolicyLocale = "en" | "bn"
export type LocalizedText = Record<PolicyLocale, string>

export interface PolicySection {
  heading: LocalizedText
  body: LocalizedText
}

/** `StorePolicy.content`. A policy nobody has written yet holds `{}`, so every key may be missing. */
export interface PolicyContent {
  title?: LocalizedText
  intro?: LocalizedText
  sections?: PolicySection[]
}

/** AdminStorePolicySerializer */
export interface StorePolicy {
  kind: PolicyKind
  label: string
  content: PolicyContent
  /** "YYYY-MM-DD" — the date the published terms apply from. */
  effective_date: string | null
  is_published: boolean
  /** Paths still blank that block publishing, e.g. "content.sections[0].body.bn". */
  missing_fields: string[]
  /** Return eligibility; null for every kind except "returns". */
  return_rules: {
    /** Days after delivery a return is accepted; null = no limit. */
    return_window_days: number | null
    preorder_returns_allowed: boolean
    non_returnable_categories: { id: string; name: string }[]
  } | null
  updated_at: string
}

/** AdminStorePolicyUpdateSerializer — every field optional (PATCH). The last three are for "returns" only. */
export interface StorePolicyUpdate {
  content?: Required<PolicyContent>
  effective_date?: string | null
  is_published?: boolean
  return_window_days?: number | null
  preorder_returns_allowed?: boolean
  non_returnable_category_ids?: string[]
}

/** One side of a revision: the policy as it stood (rule keys only on the return policy). */
export interface StorePolicySnapshot {
  content: PolicyContent
  effective_date: string | null
  is_published: boolean
  return_window_days?: number | null
  preorder_returns_allowed?: boolean
  non_returnable_category_ids?: string[]
}

/** AdminStorePolicyRevisionSerializer — written once per accepted change, never edited. */
export interface StorePolicyRevision {
  id: string
  effective_date: string | null
  changed_by_id: string | null
  changed_by_name: string
  previous: StorePolicySnapshot
  current: StorePolicySnapshot
  created_at: string
}

// ---- Outgoing email (api/v1/admin/business AdminEmailSettingsSerializer) ----

export type SmtpSecurity = "starttls" | "ssl" | "none"

/** The SMTP server saved from the dashboard. Never carries the password. */
export interface EmailDashboardServer {
  is_enabled: boolean
  /** Enabled, complete and its password readable: it is the one sending mail. */
  is_active: boolean
  host: string
  port: number
  security: SmtpSecurity
  username: string
  password_status: "set" | "missing" | "unreadable" | "not_needed"
  password_updated_at: string | null
  from_name: string
  from_email: string
  last_test_at: string | null
  last_test_accepted: boolean | null
  last_test_reason: string
  updated_at: string
  updated_by_id: string | null
}

/** The server's own EMAIL_* environment settings, used when no dashboard server is in force. */
export interface EmailEnvironmentServer {
  backend: string
  sends_real_email: boolean
  host: string
  port: number | null
  security: string
  has_credentials: boolean
  from_email: string
}

export interface EmailSettings {
  source: "dashboard" | "environment"
  /** False while mail only goes to the console log or a test backend. */
  sends_real_email: boolean
  /** The server has SECRETS_ENCRYPTION_KEYS, so a password can be saved. */
  encryption_available: boolean
  environment: EmailEnvironmentServer
  dashboard: EmailDashboardServer | null
}

/** AdminEmailSettingsUpdateSerializer: send only what changes; omit `password` to keep it. */
export interface EmailSettingsPayload {
  host?: string
  port?: number
  security?: SmtpSecurity
  username?: string
  password?: string
  from_name?: string
  from_email?: string
  is_enabled?: boolean
}

/** AdminEmailTestResultSerializer */
export interface EmailTestResult {
  /** The SMTP server took the message; not proof it reached the inbox. */
  accepted: boolean
  reason: string
  source: string
  recipient: string
}

// ---- Server-side conversion tracking (AdminConversionProviderSerializer) ----

export type ConversionProviderKey = "ga4" | "meta" | "tiktok"

export interface ConversionProvider {
  provider: ConversionProviderKey
  label: string
  /** Who decides this provider's settings: saved here, the server environment, or nobody (off). */
  source: "dashboard" | "environment" | "none"
  is_enabled: boolean
  /** Confirmed orders are being sent to it now. */
  is_active: boolean
  /** GA4 Measurement ID or Meta Pixel ID. Not a secret. */
  tracking_id: string
  secret_status: "set" | "missing" | "unreadable"
  secret_updated_at: string | null
  test_event_code: string
  environment_configured: boolean
  encryption_available: boolean
  updated_at: string | null
  updated_by_id: string | null
}

/** AdminConversionProviderUpdateSerializer: omit `secret` to keep the saved one. */
export interface ConversionProviderPayload {
  tracking_id?: string
  secret?: string
  test_event_code?: string
  is_enabled?: boolean
}
