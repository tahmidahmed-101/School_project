import { createSliceFactory } from "@/lib/sliceFactory"
import type { Product } from "../types"

const { reducer, fetchAll, fetchSingle, deleteData } = createSliceFactory<Product>({
  name: "products",
  endpoint: "/admin/catalog/products/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, deleteData }

export default reducer
