import { createSliceFactory } from "@/lib/sliceFactory"
import type { Brand } from "../types"

const { reducer, fetchAll, deleteData } = createSliceFactory<Brand>({
  name: "brands",
  endpoint: "/admin/catalog/brands/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
