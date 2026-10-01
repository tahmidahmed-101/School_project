import { createSliceFactory } from "@/lib/sliceFactory"
import type { Warehouse } from "../types"

const { reducer, fetchAll, deleteData } = createSliceFactory<Warehouse>({
  name: "inventoryWarehouses",
  endpoint: "/admin/inventory/warehouses/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
