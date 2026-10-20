import { api, apiCall, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import type {
  ConversionProvider,
  ConversionProviderKey,
  ConversionProviderPayload,
  EmailSettings,
  EmailSettingsPayload,
  EmailTestResult,
} from "./types"

const S = "/admin/settings"

// ---- outgoing email ----
export const fetchEmailSettings = () => apiCall<EmailSettings>(() => api.get(`${S}/email/`))
export const saveEmailSettings = (payload: EmailSettingsPayload) =>
  apiCall<EmailSettings>(() => api.patch(`${S}/email/`, payload))
/** Forgets the saved server; mail goes back to the server environment settings. */
export const removeEmailSettings = () => apiCall<EmailSettings>(() => api.delete(`${S}/email/`))
/** Five per hour per user. `recipient` defaults to the signed-in user's own address. */
export const sendTestEmail = (recipient?: string) =>
  apiCall<EmailTestResult>(() => api.post(`${S}/email/test/`, recipient ? { recipient } : {}))

// ---- server-side conversion tracking ----
export async function fetchConversionProviders(): Promise<ConversionProvider[]> {
  try {
    const res = await api.get(`${S}/conversion-tracking/`)
    return unwrapEnvelope<ConversionProvider[]>(res.data)
  } catch (err) {
    throw extractApiError(err)
  }
}
export const saveConversionProvider = (provider: ConversionProviderKey, payload: ConversionProviderPayload) =>
  apiCall<ConversionProvider>(() => api.patch(`${S}/conversion-tracking/${provider}/`, payload))
/** Removes the saved settings; the provider goes back to the server environment (or off). */
export const removeConversionProvider = (provider: ConversionProviderKey) =>
  apiCall<ConversionProvider>(() => api.delete(`${S}/conversion-tracking/${provider}/`))
