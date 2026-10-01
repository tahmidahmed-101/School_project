import { createSliceFactory } from "@/lib/sliceFactory"
import type { Category } from "../types"

const { reducer, fetchAll, fetchSingle, patchData, deleteData } = createSliceFactory<Category>({
  name: "categories",
  endpoint: "/admin/catalog/categories/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, patchData, deleteData }

export default reducer
