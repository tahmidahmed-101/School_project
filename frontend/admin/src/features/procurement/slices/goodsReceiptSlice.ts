import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { GoodsReceipt, GoodsReceiptCreatePayload } from "../types"

const ENDPOINT = "/admin/procurement/goods-receipts/"

// GRNs are immutable once recorded: list, detail and create only.
const { reducer, fetchAll, fetchSingle } = createSliceFactory<GoodsReceipt>({
  name: "goodsReceipts",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const createGoodsReceipt = createAsyncThunk(
  "goodsReceipts/create",
  async (payload: GoodsReceiptCreatePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<GoodsReceipt>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(createGoodsReceipt.fulfilled, (state, action) => {
    state.data = [action.payload, ...state.data]
    state.totalItems += 1
  })
})
