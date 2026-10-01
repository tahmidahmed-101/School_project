import { api } from "@/lib/api/client"
import { createApiThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { FraudCase, ResolveFraudCasePayload } from "../types"

// /admin/risk/cases/ — list filters: status, ordering (created_at, status). Read-only except
// PATCH /{id}/resolve/ (risk.manage).
const { reducer, fetchAll, fetchSingle } = createSliceFactory<FraudCase>({
  name: "fraudCases",
  endpoint: "/admin/risk/cases/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const resolveFraudCase = createApiThunk<{ id: string; payload: ResolveFraudCasePayload }, FraudCase>(
  "fraudCases/resolve",
  ({ id, payload }) => api.patch(`/admin/risk/cases/${id}/resolve/`, payload)
)

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, resolveFraudCase)
})
