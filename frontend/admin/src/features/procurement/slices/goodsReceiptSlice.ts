import { createApiThunk, createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import type { GoodsReceipt, GoodsReceiptCreatePayload } from "../types"

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
  (payload) => api.post(ENDPOINT, payload)
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(createGoodsReceipt.fulfilled, (state, action) => {
    state.data = [action.payload, ...state.data]
    state.totalItems += 1
  })
})
