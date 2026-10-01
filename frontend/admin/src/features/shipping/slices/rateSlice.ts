import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { ShippingRate, ShippingRatePayload } from "../types"

const ENDPOINT = "/admin/logistics/rates/"

// Rates are created through their zone (zoneSlice.createZoneRate); this slice lists,
// edits and deletes them.
const { reducer: baseReducer, fetchAll, deleteData } = createSliceFactory<ShippingRate>({
  name: "shippingRates",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchRates, deleteData as deleteRate }

export const updateRate = createAsyncThunk(
  "shippingRates/update",
  async ({ id, payload }: { id: string; payload: Partial<ShippingRatePayload> }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      return unwrapItem<ShippingRate>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(baseReducer, (builder) => {
  builder.addCase(updateRate.fulfilled, (state, action) => {
    state.data = state.data.map((r) => (r.id === action.payload.id ? action.payload : r))
  })
})
