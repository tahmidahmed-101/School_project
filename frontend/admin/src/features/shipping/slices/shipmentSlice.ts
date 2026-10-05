import { createActionThunk, createApiThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import type { ReceiveBackPayload, Shipment, ShipmentStatus } from "../types"

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

/** Books a returned or cancelled consignment back in: sellable units are restocked, damaged ones written off. */
export const receiveBackShipment = createApiThunk<{ id: string } & ReceiveBackPayload, Shipment>(
  "shipments/receiveBack",
  ({ id, lines }) => api.post(`${ENDPOINT}${id}/receive-back/`, { lines })
)

/** Reserves replacement stock for the damaged units still owed, so they can be shipped again. */
export const replaceDamagedUnits = createActionThunk<Shipment>("shipments/replaceDamaged", ENDPOINT, "replace-damaged")

export default withExtraCases(baseReducer, (builder) => {
  replaceOnFulfilled(builder, updateShipmentStatus, dispatchShipment, receiveBackShipment, replaceDamagedUnits)
})
