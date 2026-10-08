import { createAsyncThunk } from "@reduxjs/toolkit"
import {
  createActionThunk,
  createApiThunk,
  createSliceFactory,
  replaceOnFulfilled,
  withExtraCases,
} from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import { fetchAllPages } from "@/lib/api/fetchAll"
import type { Kind } from "@/hooks/use-kind"
import type { ShippingRatePayload, ShippingZone, ShippingZonePayload } from "../types"

const ENDPOINT = "/admin/logistics/zones/"

const {
  reducer: baseReducer,
  fetchAll,
  postData,
  patchData,
  deleteData,
} = createSliceFactory<ShippingZone>({
  name: "shippingZones",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchZones, deleteData as deleteZone }

export const createZone = (payload: ShippingZonePayload) => postData({ payload: payload as Partial<ShippingZone> })
export const updateZone = ({ id, payload }: { id: string; payload: ShippingZonePayload }) =>
  patchData({ id, payload: payload as Partial<ShippingZone> })

export const restoreZone = createActionThunk<ShippingZone>("shippingZones/restore", ENDPOINT, "restore")

/** POST /zones/{id}/rates/ — responds with the zone, rates included. */
export const createZoneRate = createApiThunk<
  { zoneId: string; payload: ShippingRatePayload & { carrier_id: string; kind: Kind } },
  ShippingZone
>("shippingZones/createRate", ({ zoneId, payload }) => api.post(`${ENDPOINT}${zoneId}/rates/`, payload))

/** Every live zone of one half (all pages), for pickers and name lookups. */
export const fetchZoneOptions = createAsyncThunk("shippingZones/options", async (kind: Kind, { rejectWithValue }) => {
  try {
    return await fetchAllPages<ShippingZone>(ENDPOINT, { ordering: "name", kind })
  } catch (err) {
    return rejectWithValue(err)
  }
})

export default withExtraCases(baseReducer, (builder) => {
  replaceOnFulfilled(builder, restoreZone, createZoneRate)
})
