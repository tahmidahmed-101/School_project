import { createAsyncThunk } from "@reduxjs/toolkit"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { ProductReview, ProductReviewModerationPayload } from "../types"

const ENDPOINT = "/admin/catalog/reviews/"

// /admin/catalog/reviews/ — list (filters: product_id, rating, status, search), moderate
// (PATCH status published/hidden) and delete; customers write reviews on the storefront,
// staff moderate them here.
const { reducer, fetchAll, deleteData } = createSliceFactory<ProductReview>({
  name: "catalogReviews",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, deleteData }

/** Publishes a review or hides it from the storefront, with an optional internal note. */
export const moderateReview = createAsyncThunk(
  "catalogReviews/moderateReview",
  async ({ id, payload }: { id: string; payload: ProductReviewModerationPayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      invalidateAllPages(ENDPOINT)
      return unwrapItem<ProductReview>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(moderateReview.fulfilled, (state, { payload }) => {
    state.data = state.data.map((r) => (r.id === payload.id ? payload : r)) as typeof state.data
  })
})
