import { createSliceFactory } from "@/lib/sliceFactory"
import type { StockLedgerEntry } from "../types"

const { reducer, fetchAll } = createSliceFactory<StockLedgerEntry>({
  name: "inventoryLedger",
  endpoint: "/admin/inventory/ledger-entries/",
  initialSingleData: null,
})

export { fetchAll }

export default reducer
