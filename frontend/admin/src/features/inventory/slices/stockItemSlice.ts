import { createSliceFactory } from "@/lib/sliceFactory"
import type { StockItem } from "../types"

const { reducer, fetchAll, deleteData } = createSliceFactory<StockItem>({
  name: "inventoryStockItems",
  endpoint: "/admin/inventory/stock-items/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
