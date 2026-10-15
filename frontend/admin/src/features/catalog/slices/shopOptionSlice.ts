import { createSliceFactory } from "@/lib/sliceFactory"
import type { ShopOption } from "../types"

const { reducer, fetchAll, deleteData } = createSliceFactory<ShopOption>({
  name: "shopOptions",
  endpoint: "/admin/catalog/options/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
