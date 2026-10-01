import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem, unwrapList } from "@/lib/api/envelope"
import type { ShippingRatePayload, ShippingZone, ShippingZonePayload } from "../types"

const ENDPOINT = "/admin/logistics/zones/"

const { reducer: baseReducer, fetchAll, deleteData } = createSliceFactory<ShippingZone>({
  name: "shippingZones",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchZones, deleteData as deleteZone }

export const createZone = createAsyncThunk(
  "shippingZones/create",
  async (payload: ShippingZonePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<ShippingZone>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const updateZone = createAsyncThunk(
  "shippingZones/update",
  async ({ id, payload }: { id: string; payload: ShippingZonePayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      return unwrapItem<ShippingZone>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const restoreZone = createAsyncThunk("shippingZones/restore", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.post(`${ENDPOINT}${id}/restore/`)
    return unwrapItem<ShippingZone>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

/** POST /zones/{id}/rates/ — responds with the zone, rates included. */
export const createZoneRate = createAsyncThunk(
  "shippingZones/createRate",
  async (
    { zoneId, payload }: { zoneId: string; payload: ShippingRatePayload & { carrier_id: string } },
    { rejectWithValue }
  ) => {
    try {
      const res = await api.post(`${ENDPOINT}${zoneId}/rates/`, payload)
      return unwrapItem<ShippingZone>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** Every live zone in one request, for pickers and name lookups. */
export const fetchZoneOptions = createAsyncThunk("shippingZones/options", async (_: void, { rejectWithValue }) => {
  try {
    const res = await api.get(ENDPOINT, { params: { page: 1, page_size: 100, ordering: "name" } })
    return unwrapList<ShippingZone>(res.data, 1, 100).items
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export default withExtraCases(baseReducer, (builder) => {
  for (const thunk of [updateZone, restoreZone, createZoneRate]) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      state.data = state.data.map((z) => (z.id === action.payload.id ? action.payload : z))
    })
  }
})
