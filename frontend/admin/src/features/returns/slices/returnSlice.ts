import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { Rma, RmaCondition } from "../types"

const ENDPOINT = "/admin/orders/returns/"

const { reducer: baseReducer, fetchAll, fetchSingle } = createSliceFactory<Rma>({
  name: "returns",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll as fetchAllReturns, fetchSingle as fetchReturn }

export type RmaAction = "approve" | "reject" | "receive"

export const runReturnAction = createAsyncThunk(
  "returns/action",
  async ({ id, action }: { id: string; action: RmaAction }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${id}/${action}/`)
      return unwrapItem<Rma>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

/** Grade one RMA line sellable/damaged (RMA must be approved). Responds with the whole RMA. */
export const gradeReturnLine = createAsyncThunk(
  "returns/gradeLine",
  async ({ lineId, condition }: { lineId: string; condition: Exclude<RmaCondition, ""> }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}lines/${lineId}/grade/`, { condition })
      return unwrapItem<Rma>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(baseReducer, (builder) => {
  for (const thunk of [runReturnAction, gradeReturnLine]) {
    builder.addCase(thunk.fulfilled, (state, action) => {
      const rma = action.payload
      if ((state.singleData as Rma | null)?.id === rma.id) state.singleData = rma
      state.data = state.data.map((r) => (r.id === rma.id ? rma : r))
    })
  }
})
