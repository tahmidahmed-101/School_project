import { createApiThunk, createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type { GoodsReceipt, GoodsReceiptCreatePayload } from "../types"
import { PURCHASE_ORDERS_ENDPOINT } from "./purchaseOrderSlice"

const ENDPOINT = "/admin/procurement/goods-receipts/"

// GRNs are immutable once recorded: list, detail and create only.
const { reducer, fetchAll, fetchSingle } = createSliceFactory<GoodsReceipt>({
  name: "goodsReceipts",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const createGoodsReceipt = createApiThunk<GoodsReceiptCreatePayload, GoodsReceipt>(
  "goodsReceipts/create",
  async (payload) => {
    const res = await api.post(ENDPOINT, payload)
    // A receipt changes the received quantities and status of its purchase order.
    invalidateAllPages(PURCHASE_ORDERS_ENDPOINT)
    return res
  }
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(createGoodsReceipt.fulfilled, (state, action) => {
    state.data = [action.payload, ...state.data]
    state.totalItems += 1
  })
})
