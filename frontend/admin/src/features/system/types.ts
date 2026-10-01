// Mirrors api/v1/admin/business/serializers.py (kull-mart), mounted at /admin/settings/.

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
  label: string
  description: string
  is_enabled: boolean
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
