import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { FraudCase, ResolveFraudCasePayload } from "../types"

// /admin/risk/cases/ — list filters: status, ordering (created_at, status). Read-only except
// PATCH /{id}/resolve/ (risk.manage).
const { reducer, fetchAll, fetchSingle } = createSliceFactory<FraudCase>({
  name: "fraudCases",
  endpoint: "/admin/risk/cases/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const resolveFraudCase = createAsyncThunk(
  "fraudCases/resolve",
  async ({ id, payload }: { id: string; payload: ResolveFraudCasePayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`/admin/risk/cases/${id}/resolve/`, payload)
      return unwrapItem<FraudCase>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(resolveFraudCase.fulfilled, (state, action) => {
    const updated = action.payload
    state.data = state.data.map((c) => (c.id === updated.id ? updated : c))
    if (state.singleData && (state.singleData as FraudCase).id === updated.id) state.singleData = updated
  })
})
