import { createSliceFactory } from "@/lib/sliceFactory"
import type { ShippingRate } from "../types"

const ENDPOINT = "/admin/logistics/rates/"

// Rates are created through their zone (zoneSlice.createZoneRate); this slice lists,
// edits and deletes them.
const { reducer, fetchAll, patchData, deleteData } = createSliceFactory<ShippingRate>({
  name: "shippingRates",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchRates, patchData as updateRate, deleteData as deleteRate }

export default reducer
