import { createSliceFactory } from "@/lib/sliceFactory"
import type { Bundle } from "../types"

const { reducer, fetchAll, fetchSingle, deleteData } = createSliceFactory<Bundle>({
  name: "catalogBundles",
  endpoint: "/admin/catalog/bundles/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, deleteData }

export default reducer
