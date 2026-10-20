import { createSliceFactory } from "@/lib/sliceFactory"
import type { StockTransfer } from "../types"

// /admin/inventory/transfers/ — list (filters: warehouse_id, variant_id, kind, search); create
// goes through postStockTransfer in ../api.
const { reducer, fetchAll } = createSliceFactory<StockTransfer>({
  name: "inventoryTransfers",
  endpoint: "/admin/inventory/transfers/",
  initialSingleData: null,
})

export { fetchAll }

export default reducer
