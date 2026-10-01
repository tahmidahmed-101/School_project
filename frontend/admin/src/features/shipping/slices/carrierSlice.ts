import { createAsyncThunk } from "@reduxjs/toolkit"
import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import { fetchAllPages } from "@/lib/api/fetchAll"
import type { Carrier, CarrierPayload } from "../types"

const ENDPOINT = "/admin/logistics/carriers/"

const {
  reducer: baseReducer,
  fetchAll,
  postData,
  patchData,
  deleteData,
} = createSliceFactory<Carrier>({
  name: "carriers",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchCarriers, deleteData as deleteCarrier }

// The write payload carries write-only secrets (api_key…) that the Carrier record doesn't.
export const createCarrier = (payload: CarrierPayload) => postData({ payload: payload as Partial<Carrier> })
export const updateCarrier = ({ id, payload }: { id: string; payload: CarrierPayload }) =>
  patchData({ id, payload: payload as Partial<Carrier> })

export const restoreCarrier = createActionThunk<Carrier>("carriers/restore", ENDPOINT, "restore")

/** Every live carrier (all pages), for pickers and name lookups. */
export const fetchCarrierOptions = createAsyncThunk("carriers/options", async (_: void, { rejectWithValue }) => {
  try {
    return await fetchAllPages<Carrier>(ENDPOINT, { ordering: "name" })
  } catch (err) {
    return rejectWithValue(err)
  }
})

export default withExtraCases(baseReducer, (builder) => {
  replaceOnFulfilled(builder, restoreCarrier)
})
