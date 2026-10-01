import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem, unwrapList } from "@/lib/api/envelope"
import type { Carrier, CarrierPayload } from "../types"

const ENDPOINT = "/admin/logistics/carriers/"

const { reducer: baseReducer, fetchAll, deleteData } = createSliceFactory<Carrier>({
  name: "carriers",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchCarriers, deleteData as deleteCarrier }

export const createCarrier = createAsyncThunk("carriers/create", async (payload: CarrierPayload, { rejectWithValue }) => {
  try {
    const res = await api.post(ENDPOINT, payload)
    return unwrapItem<Carrier>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export const updateCarrier = createAsyncThunk(
  "carriers/update",
  async ({ id, payload }: { id: string; payload: CarrierPayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      return unwrapItem<Carrier>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const restoreCarrier = createAsyncThunk("carriers/restore", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.post(`${ENDPOINT}${id}/restore/`)
    return unwrapItem<Carrier>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

/** Every live carrier in one request (there are only a handful), for pickers and name lookups. */
export const fetchCarrierOptions = createAsyncThunk("carriers/options", async (_: void, { rejectWithValue }) => {
  try {
    const res = await api.get(ENDPOINT, { params: { page: 1, page_size: 100, ordering: "name" } })
    return unwrapList<Carrier>(res.data, 1, 100).items
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export default withExtraCases(baseReducer, (builder) => {
  for (const thunk of [updateCarrier, restoreCarrier]) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      state.data = state.data.map((c) => (c.id === action.payload.id ? action.payload : c))
    })
  }
})
