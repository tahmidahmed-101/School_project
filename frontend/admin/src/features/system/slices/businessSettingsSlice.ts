import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope } from "@/lib/api/envelope"
import { setDefaultCurrency } from "@/lib/format"
import type {
  BusinessModule,
  BusinessProfile,
  BusinessProfileUpdate,
  IntegrationStatus,
  ModuleUpdatePayload,
  PaymentMethodState,
} from "../types"

// Not sliceFactory-backed: /admin/settings/ is a singleton profile plus keyed (not id'd)
// module / payment-method collections, so the CRUD factory's shape doesn't fit.

type Status = "idle" | "loading" | "succeeded" | "failed"

interface Section<T> {
  data: T
  status: Status
  error: unknown
}

interface BusinessSettingsState {
  profile: Section<BusinessProfile | null>
  modules: Section<BusinessModule[]>
  paymentMethods: Section<PaymentMethodState[]>
  integrations: Section<IntegrationStatus | null>
}

const section = <T,>(data: T): Section<T> => ({ data, status: "idle", error: null })

const initialState: BusinessSettingsState = {
  profile: section(null),
  modules: section([]),
  paymentMethods: section([]),
  integrations: section(null),
}

const get = <T,>(type: string, url: string) =>
  createAsyncThunk(type, async (_: void, { rejectWithValue }) => {
    try {
      const res = await api.get(url)
      return unwrapEnvelope<T>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })

/**
 * GET /admin/settings/business-profile/ (settings.view). Also points the app-wide money
 * formatter at the store's currency — dispatch this once after sign-in so formatCurrency
 * uses the configured currency everywhere.
 */
export const fetchBusinessProfile = createAsyncThunk(
  "businessSettings/fetchProfile",
  async (_: void, { rejectWithValue }) => {
    try {
      const res = await api.get("/admin/settings/business-profile/")
      const profile = unwrapEnvelope<BusinessProfile>(res.data)
      setDefaultCurrency(profile.currency_code)
      return profile
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** PATCH /admin/settings/business-profile/ (settings.manage). */
export const updateBusinessProfile = createAsyncThunk(
  "businessSettings/updateProfile",
  async (patch: BusinessProfileUpdate, { rejectWithValue }) => {
    try {
      const res = await api.patch("/admin/settings/business-profile/", patch)
      const profile = unwrapEnvelope<BusinessProfile>(res.data)
      setDefaultCurrency(profile.currency_code)
      return profile
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const fetchModules = get<BusinessModule[]>("businessSettings/fetchModules", "/admin/settings/modules/")
export const fetchPaymentMethods = get<PaymentMethodState[]>(
  "businessSettings/fetchPaymentMethods",
  "/admin/settings/payment-methods/"
)
export const fetchIntegrations = get<IntegrationStatus>("businessSettings/fetchIntegrations", "/admin/settings/integrations/")

/** PATCH /admin/settings/modules/{key}/ — send either {is_enabled} or {config}, never both. */
export const updateModule = createAsyncThunk(
  "businessSettings/updateModule",
  async ({ key, payload }: { key: string; payload: ModuleUpdatePayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/settings/modules/${key}/`, payload)
      return unwrapEnvelope<BusinessModule>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** PATCH /admin/settings/payment-methods/{key}/ {is_enabled}. */
export const updatePaymentMethod = createAsyncThunk(
  "businessSettings/updatePaymentMethod",
  async ({ key, is_enabled }: { key: string; is_enabled: boolean }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/settings/payment-methods/${key}/`, { is_enabled })
      return unwrapEnvelope<PaymentMethodState>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

const businessSettingsSlice = createSlice({
  name: "businessSettings",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    const pending = (sec: Section<unknown>) => {
      sec.status = "loading"
      sec.error = null
    }
    const failed = (sec: Section<unknown>, error: unknown) => {
      sec.status = "failed"
      sec.error = error
    }

    builder
      .addCase(fetchBusinessProfile.pending, (state) => pending(state.profile))
      .addCase(fetchBusinessProfile.fulfilled, (state, action) => {
        state.profile = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchBusinessProfile.rejected, (state, action) => failed(state.profile, action.payload ?? action.error))

      .addCase(fetchModules.pending, (state) => pending(state.modules))
      .addCase(fetchModules.fulfilled, (state, action) => {
        state.modules = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchModules.rejected, (state, action) => failed(state.modules, action.payload ?? action.error))

      .addCase(fetchPaymentMethods.pending, (state) => pending(state.paymentMethods))
      .addCase(fetchPaymentMethods.fulfilled, (state, action) => {
        state.paymentMethods = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchPaymentMethods.rejected, (state, action) =>
        failed(state.paymentMethods, action.payload ?? action.error)
      )

      .addCase(fetchIntegrations.pending, (state) => pending(state.integrations))
      .addCase(fetchIntegrations.fulfilled, (state, action) => {
        state.integrations = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchIntegrations.rejected, (state, action) =>
        failed(state.integrations, action.payload ?? action.error)
      )

    builder
      .addCase(updateBusinessProfile.fulfilled, (state, action) => {
        state.profile.data = action.payload
        state.profile.status = "succeeded"
      })
      .addCase(updateModule.fulfilled, (state, action) => {
        state.modules.data = state.modules.data.map((m) => (m.key === action.payload.key ? action.payload : m))
      })
      .addCase(updatePaymentMethod.fulfilled, (state, action) => {
        state.paymentMethods.data = state.paymentMethods.data.map((m) =>
          m.key === action.payload.key ? action.payload : m
        )
      })
  },
})

export default businessSettingsSlice.reducer
