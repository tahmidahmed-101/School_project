import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { Shipment, ShipmentStatus } from "../types"

const ENDPOINT = "/admin/orders/shipments/"

const { reducer: baseReducer, fetchAll, fetchSingle } = createSliceFactory<Shipment>({
  name: "shipments",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchAllShipments, fetchSingle as fetchShipment }

export const updateShipmentStatus = createAsyncThunk(
  "shipments/updateStatus",
  async ({ id, status }: { id: string; status: ShipmentStatus }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/status/`, { status })
      return unwrapItem<Shipment>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** Books the consignment with the carrier's courier gateway (auto-picks a carrier if none). */
export const dispatchShipment = createAsyncThunk("shipments/dispatch", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.post(`${ENDPOINT}${id}/dispatch/`)
    return unwrapItem<Shipment>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export default withExtraCases(baseReducer, (builder) => {
  for (const thunk of [updateShipmentStatus, dispatchShipment]) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      const shipment = action.payload
      if ((state.singleData as Shipment | null)?.id === shipment.id) state.singleData = shipment
      state.data = state.data.map((s) => (s.id === shipment.id ? shipment : s))
    })
  }
})
