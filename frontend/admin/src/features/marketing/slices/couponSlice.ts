import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { Coupon } from "../types"

// /admin/coupons/ — list filters: search (code), ordering (code, created_at, expires_at),
// include_deleted. DELETE is a soft delete; /{id}/restore/ brings it back.
const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Coupon>({
  name: "coupons",
  endpoint: "/admin/coupons/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export const restoreCoupon = createAsyncThunk("coupons/restore", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.post(`/admin/coupons/${id}/restore/`)
    return unwrapItem<Coupon>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreCoupon.fulfilled, (state, action) => {
    state.data = state.data.map((c) => (c.id === action.payload.id ? action.payload : c))
  })
})
