import { createSliceFactory } from "@/lib/sliceFactory"
import type { Category } from "../types"

const { reducer, fetchSingle } = createSliceFactory<Category>({
  name: "categories",
  endpoint: "/admin/catalog/categories/",
  initialSingleData: null,
})

export { fetchSingle }

export default reducer
