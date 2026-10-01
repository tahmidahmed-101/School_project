import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { Payment } from "../types"

const ENDPOINT = "/admin/orders/payments/"

const { reducer: baseReducer, fetchAll, fetchSingle } = createSliceFactory<Payment>({
  name: "payments",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchAllPayments, fetchSingle as fetchPayment }

/** Omit `amount` to refund everything still outstanding (amount − refunded_amount). */
export const refundPayment = createAsyncThunk(
  "payments/refund",
  async ({ id, amount }: { id: string; amount?: string }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${id}/refund/`, amount ? { amount } : {})
      return unwrapItem<Payment>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(baseReducer, (builder) => {
  builder.addCase(refundPayment.fulfilled, (state, action) => {
    if ((state.singleData as Payment | null)?.id === action.payload.id) state.singleData = action.payload
    state.data = state.data.map((p) => (p.id === action.payload.id ? action.payload : p))
  })
})
