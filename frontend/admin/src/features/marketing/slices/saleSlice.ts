import { createSliceFactory } from "@/lib/sliceFactory"
import type { Sale } from "../types"

// /admin/sales/ — list filter: status (scheduled | running | ended | off).
const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Sale>({
  name: "sales",
  endpoint: "/admin/sales/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default reducer
