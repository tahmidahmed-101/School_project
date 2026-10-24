import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapEnvelope, unwrapList } from "@/lib/api/envelope"
import type { Kind } from "@/hooks/use-kind"
import { setDefaultCurrency } from "@/lib/format"
import type {
  BusinessModule,
  BusinessProfile,
  BusinessProfileUpdate,
  HeroSlide,
  HeroSlideInput,
  IntegrationStatus,
  ModuleUpdatePayload,
  PaymentMethodState,
  PolicyKind,
  PromoLine,
  PromoLineInput,
  PromotionPopup,
  PromotionPopupInput,
  StorePolicy,
  StorePolicyUpdate,
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
  policies: Section<StorePolicy[]>
  heroSlides: Section<HeroSlide[]>
  promoLines: Section<PromoLine[]>
  promotionPopups: Section<PromotionPopup[]>
}

const section = <T,>(data: T): Section<T> => ({ data, status: "idle", error: null })

const initialState: BusinessSettingsState = {
  profile: section(null),
  modules: section([]),
  paymentMethods: section([]),
  integrations: section(null),
  policies: section([]),
  heroSlides: section([]),
  promoLines: section([]),
  promotionPopups: section([]),
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

const getList = <T,>(type: string, url: string) =>
  createAsyncThunk(type, async (_: void, { rejectWithValue }) => {
    try {
      const res = await api.get(url)
      return unwrapList<T>(res.data).items
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })

const remove = (type: string, url: string) =>
  createAsyncThunk(type, async (id: string, { rejectWithValue }) => {
    try {
      await api.delete(`${url}${id}/`)
      return id
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })

const upsert = <T extends { id: string; sort_order: number }>(rows: T[], saved: T) =>
  [...rows.filter((row) => row.id !== saved.id), saved].sort((a, b) => a.sort_order - b.sort_order)

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
/** GET /admin/settings/payment-methods/?kind= — one half's own switches and numbers. */
export const fetchPaymentMethods = createAsyncThunk(
  "businessSettings/fetchPaymentMethods",
  async (kind: Kind, { rejectWithValue }) => {
    try {
      const res = await api.get("/admin/settings/payment-methods/", { params: { kind } })
      return unwrapEnvelope<PaymentMethodState[]>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)
export const fetchIntegrations = get<IntegrationStatus>("businessSettings/fetchIntegrations", "/admin/settings/integrations/")

/** GET /admin/settings/policies/ (settings.view) — shipping, return and refund policies, drafts included. */
export const fetchPolicies = get<StorePolicy[]>("businessSettings/fetchPolicies", "/admin/settings/policies/")

/**
 * PATCH /admin/settings/policies/{kind}/ (settings.manage). Edits, publishes or unpublishes;
 * the backend refuses to publish an incomplete policy (see services/policies.py).
 */
export const updatePolicy = createAsyncThunk(
  "businessSettings/updatePolicy",
  async ({ kind, patch }: { kind: PolicyKind; patch: StorePolicyUpdate }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/settings/policies/${kind}/`, patch)
      return unwrapEnvelope<StorePolicy>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

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

/** PATCH /admin/settings/payment-methods/{key}/?kind= {is_enabled?, pay_to?}. */
export const updatePaymentMethod = createAsyncThunk(
  "businessSettings/updatePaymentMethod",
  async (
    { key, kind, ...patch }: { key: string; kind: Kind; is_enabled?: boolean; pay_to?: string },
    { rejectWithValue }
  ) => {
    try {
      const res = await api.patch(`/admin/settings/payment-methods/${key}/`, patch, { params: { kind } })
      return unwrapEnvelope<PaymentMethodState>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

const HERO_SLIDES = "/admin/settings/hero-slides/"
const PROMO_LINES = "/admin/settings/promo-lines/"

export const fetchHeroSlides = getList<HeroSlide>("businessSettings/fetchHeroSlides", HERO_SLIDES)
export const fetchPromoLines = getList<PromoLine>("businessSettings/fetchPromoLines", PROMO_LINES)

/** POST (no id; `image` required) or PATCH /admin/settings/hero-slides/{id}/. Multipart whenever an image is sent. */
export const saveHeroSlide = createAsyncThunk(
  "businessSettings/saveHeroSlide",
  async (
    { id, values, image }: { id?: string; values: Partial<HeroSlideInput>; image?: File | null },
    { rejectWithValue }
  ) => {
    try {
      let body: FormData | Partial<HeroSlideInput> = values
      if (image) {
        body = new FormData()
        for (const [key, value] of Object.entries(values)) body.append(key, String(value))
        body.append("image", image)
      }
      const res = id ? await api.patch(`${HERO_SLIDES}${id}/`, body) : await api.post(HERO_SLIDES, body)
      return unwrapEnvelope<HeroSlide>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const deleteHeroSlide = remove("businessSettings/deleteHeroSlide", HERO_SLIDES)

/** POST (no id) or PATCH /admin/settings/promo-lines/{id}/. */
export const savePromoLine = createAsyncThunk(
  "businessSettings/savePromoLine",
  async ({ id, values }: { id?: string; values: Partial<PromoLineInput> }, { rejectWithValue }) => {
    try {
      const res = id ? await api.patch(`${PROMO_LINES}${id}/`, values) : await api.post(PROMO_LINES, values)
      return unwrapEnvelope<PromoLine>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const deletePromoLine = remove("businessSettings/deletePromoLine", PROMO_LINES)

const PROMOTION_POPUPS = "/admin/settings/promotion-popups/"

/** Every popup, switched-off, scheduled and ended ones included, in the order the storefront prefers them. */
export const fetchPromotionPopups = getList<PromotionPopup>("businessSettings/fetchPromotionPopups", PROMOTION_POPUPS)

/**
 * POST (no id) or PATCH /admin/settings/promotion-popups/{id}/. Multipart when a new image is sent (always on create);
 * JSON otherwise. The image can be replaced, never removed.
 */
export const savePromotionPopup = createAsyncThunk(
  "businessSettings/savePromotionPopup",
  async (
    { id, values, image }: { id?: string; values: Partial<PromotionPopupInput>; image?: File | null },
    { rejectWithValue }
  ) => {
    try {
      let body: FormData | Partial<PromotionPopupInput> = values
      if (image) {
        const form = new FormData()
        for (const [key, value] of Object.entries(values)) {
          if (value === undefined) continue
          // A list goes as repeated keys; null as "", which DRF reads as null on a nullable field.
          if (Array.isArray(value)) value.forEach((item) => form.append(key, String(item)))
          else form.append(key, value === null ? "" : String(value))
        }
        form.append("image", image)
        body = form
      }
      const res = id ? await api.patch(`${PROMOTION_POPUPS}${id}/`, body) : await api.post(PROMOTION_POPUPS, body)
      return unwrapEnvelope<PromotionPopup>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const deletePromotionPopup = remove("businessSettings/deletePromotionPopup", PROMOTION_POPUPS)

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
      .addCase(fetchModules.rejected, (state, action) => {
        // Settings cancels its copy of this request on unmount while the layout's is still running; a
        // cancelled request is not a failed one, and "failed" would read as "the list is known".
        if (!action.meta.aborted) failed(state.modules, action.payload ?? action.error)
      })

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

      .addCase(fetchPolicies.pending, (state) => pending(state.policies))
      .addCase(fetchPolicies.fulfilled, (state, action) => {
        state.policies = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchPolicies.rejected, (state, action) => failed(state.policies, action.payload ?? action.error))

      .addCase(fetchHeroSlides.pending, (state) => pending(state.heroSlides))
      .addCase(fetchHeroSlides.fulfilled, (state, action) => {
        state.heroSlides = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchHeroSlides.rejected, (state, action) => failed(state.heroSlides, action.payload ?? action.error))

      .addCase(fetchPromoLines.pending, (state) => pending(state.promoLines))
      .addCase(fetchPromoLines.fulfilled, (state, action) => {
        state.promoLines = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchPromoLines.rejected, (state, action) => failed(state.promoLines, action.payload ?? action.error))

      .addCase(fetchPromotionPopups.pending, (state) => pending(state.promotionPopups))
      .addCase(fetchPromotionPopups.fulfilled, (state, action) => {
        state.promotionPopups = { data: action.payload, status: "succeeded", error: null }
      })
      .addCase(fetchPromotionPopups.rejected, (state, action) =>
        failed(state.promotionPopups, action.payload ?? action.error)
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
          m.key === action.payload.key && m.kind === action.payload.kind ? action.payload : m
        )
      })
      .addCase(updatePolicy.fulfilled, (state, action) => {
        state.policies.data = state.policies.data.map((p) => (p.kind === action.payload.kind ? action.payload : p))
      })
      .addCase(saveHeroSlide.fulfilled, (state, action) => {
        state.heroSlides.data = upsert(state.heroSlides.data, action.payload)
      })
      .addCase(deleteHeroSlide.fulfilled, (state, action) => {
        state.heroSlides.data = state.heroSlides.data.filter((slide) => slide.id !== action.payload)
      })
      .addCase(savePromoLine.fulfilled, (state, action) => {
        state.promoLines.data = upsert(state.promoLines.data, action.payload)
      })
      .addCase(deletePromoLine.fulfilled, (state, action) => {
        state.promoLines.data = state.promoLines.data.filter((line) => line.id !== action.payload)
      })
      .addCase(savePromotionPopup.fulfilled, (state, action) => {
        // The server lists the newest first; re-sorting here mirrors that for the row just saved.
        state.promotionPopups.data = [
          ...state.promotionPopups.data.filter((popup) => popup.id !== action.payload.id),
          action.payload,
        ].sort((a, b) => b.created_at.localeCompare(a.created_at))
      })
      .addCase(deletePromotionPopup.fulfilled, (state, action) => {
        state.promotionPopups.data = state.promotionPopups.data.filter((popup) => popup.id !== action.payload)
      })
  },
})

export default businessSettingsSlice.reducer
