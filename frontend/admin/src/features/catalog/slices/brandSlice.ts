import { createSliceFactory } from "@/lib/sliceFactory"
import type { Brand } from "../types"

const { reducer, fetchAll, fetchSingle, patchData, deleteData } = createSliceFactory<Brand>({
  name: "brands",
  endpoint: "/admin/catalog/brands/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, patchData, deleteData }

export default reducer
