import { createActionThunk, createApiThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import type { Shipment, ShipmentStatus } from "../types"

const ENDPOINT = "/admin/orders/shipments/"

const { reducer: baseReducer, fetchAll, fetchSingle } = createSliceFactory<Shipment>({
  name: "shipments",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchAllShipments, fetchSingle as fetchShipment }

export const updateShipmentStatus = createApiThunk<{ id: string; status: ShipmentStatus }, Shipment>(
  "shipments/updateStatus",
  ({ id, status }) => api.patch(`${ENDPOINT}${id}/status/`, { status })
)

/** Books the consignment with the carrier's courier gateway (auto-picks a carrier if none). */
export const dispatchShipment = createActionThunk<Shipment>("shipments/dispatch", ENDPOINT, "dispatch")

export default withExtraCases(baseReducer, (builder) => {
  replaceOnFulfilled(builder, updateShipmentStatus, dispatchShipment)
})
