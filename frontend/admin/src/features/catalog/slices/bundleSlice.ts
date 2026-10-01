import { createSliceFactory } from "@/lib/sliceFactory"
import type { Bundle } from "../types"

const { reducer, fetchAll, fetchSingle, patchData, deleteData } = createSliceFactory<Bundle>({
  name: "catalogBundles",
  endpoint: "/admin/catalog/bundles/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, patchData, deleteData }

export default reducer
