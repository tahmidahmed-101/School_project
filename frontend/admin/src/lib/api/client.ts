import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios"
import { getAccessToken, setAccessToken, clearTokens } from "./tokenStore"

export const SESSION_EXPIRED_EVENT = "auth:session-expired"

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api/v1"

// The kull-mart backend keeps the refresh token in an HttpOnly cookie scoped to
// /api/v1/customer/auth/, so requests must carry credentials for refresh/logout to work.
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.set("Authorization", `Bearer ${token}`)
  }
  return config
})

// Interceptor-free instance for the refresh call itself, so a 401 from /refresh can't
// recurse into another refresh.
const refreshClient = axios.create({ baseURL: API_BASE_URL, withCredentials: true })

// Dedup concurrent 401s so only one refresh call is ever in flight at a time.
let refreshPromise: Promise<string> | null = null

/**
 * Exchanges the refresh cookie for a new access token. The backend rotates the cookie
 * on every call (and blacklists the old one), so concurrent refreshes must be avoided —
 * use `refreshAccessToken()` rather than calling this directly.
 */
async function performRefresh(): Promise<string> {
  const res = await refreshClient.post("/customer/auth/refresh/")
  const newAccessToken = res.data?.data?.access as string | undefined
  if (!newAccessToken) {
    throw new Error("Refresh response missing access token")
  }
  setAccessToken(newAccessToken)
  return newAccessToken
}

/** Shared, de-duplicated refresh: concurrent callers await the same in-flight request. */
export function refreshAccessToken(): Promise<string> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}

// Auth endpoints answer 401 for bad credentials / bad tokens; refreshing on those is
// pointless and would wrongly broadcast "session expired" on a failed login.
const isAuthEndpoint = (url?: string) => !!url && /\/auth\/(login|refresh|logout)\//.test(url)

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableConfig | undefined

    if (
      error.response?.status !== 401 ||
      !originalRequest ||
      originalRequest._retried ||
      isAuthEndpoint(originalRequest.url)
    ) {
      return Promise.reject(error)
    }

    originalRequest._retried = true

    try {
      const newAccessToken = await refreshAccessToken()
      originalRequest.headers.set("Authorization", `Bearer ${newAccessToken}`)
      return api(originalRequest)
    } catch {
      clearTokens()
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
      return Promise.reject(error)
    }
  }
)

/** Normalised API error carried by rejected thunks (`rejectWithValue(extractApiError(err))`). */
export interface ApiError {
  /** HTTP status, or 0 for network failures. */
  status: number
  /** Backend error code, e.g. "not_found", "invalid", "permission_denied". */
  code: string
  message: string
  /** Field-level validation messages, keyed by field name. */
  fields: Record<string, string[]>
}

// Kull-mart errors look like { error: { code, message, fields } } (apps/common/exception_handler.py).
export function extractApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status ?? 0
    const body = err.response?.data as Record<string, unknown> | undefined
    const envelope = (body?.error && typeof body.error === "object" ? body.error : body) as
      | Record<string, unknown>
      | undefined

    const rawFields = (envelope?.fields ?? {}) as Record<string, unknown>
    const fields: Record<string, string[]> = {}
    for (const [key, value] of Object.entries(rawFields)) {
      fields[key] = Array.isArray(value) ? value.map(String) : [String(value)]
    }

    const message =
      (typeof envelope?.message === "string" && envelope.message) ||
      (typeof envelope?.detail === "string" && envelope.detail) ||
      (status === 0 ? "Can't reach the server. Check your connection." : err.message)

    const code =
      (typeof envelope?.code === "string" && envelope.code) || (status === 404 ? "not_found" : "error")

    return { status, code, message, fields }
  }
  return { status: 0, code: "error", message: String(err), fields: {} }
}

/**
 * Best human-readable message for an error: the first field error when the backend's
 * generic "Validation failed." would otherwise hide what actually went wrong.
 */
export function getApiErrorMessage(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (err && typeof err === "object") {
    const e = err as Partial<ApiError> & Record<string, unknown>
    const firstField = e.fields ? Object.entries(e.fields).find(([, msgs]) => msgs?.length) : undefined
    if (firstField) {
      const [field, msgs] = firstField
      return field === "non_field_errors" ? msgs[0] : `${field.replace(/_/g, " ")}: ${msgs[0]}`
    }
    const detail = e.message ?? e.detail ?? e.error
    if (typeof detail === "string" && detail.trim()) return detail
  }
  return fallback
}

/** Field errors from a rejected request, for mapping onto react-hook-form fields. */
export function getApiFieldErrors(err: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const fields = (err as Partial<ApiError> | null)?.fields
  if (fields) {
    for (const [field, msgs] of Object.entries(fields)) {
      if (msgs?.length) out[field] = msgs[0]
    }
  }
  return out
}
