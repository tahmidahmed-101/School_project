import { createSliceFactory } from "@/lib/sliceFactory"
import type { ProductVariant } from "../types"

const { reducer, fetchAll, fetchSingle, patchData, deleteData } = createSliceFactory<ProductVariant>({
  name: "variants",
  endpoint: "/admin/catalog/variants/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, patchData, deleteData }

export default reducer
