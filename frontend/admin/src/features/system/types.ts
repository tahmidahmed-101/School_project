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
