import { createAsyncThunk } from "@reduxjs/toolkit"
import {
  createActionThunk,
  createApiThunk,
  createSliceFactory,
  replaceOnFulfilled,
  withExtraCases,
} from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { invalidateAllPages } from "@/hooks/use-all-pages"
import type {
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  PurchaseOrderLine,
  PurchaseOrderLineInput,
  PurchaseOrderLineUpdate,
  PurchaseOrderUpdatePayload,
} from "../types"

export const PURCHASE_ORDERS_ENDPOINT = "/admin/procurement/purchase-orders/"
const ENDPOINT = PURCHASE_ORDERS_ENDPOINT

const changed = <R>(res: R) => {
  invalidateAllPages(ENDPOINT)
  return res
}

const { reducer, fetchAll, fetchSingle, deleteData } = createSliceFactory<PurchaseOrder>({
  name: "purchaseOrders",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle, deleteData }

export const createPurchaseOrder = createApiThunk<PurchaseOrderCreatePayload, PurchaseOrder>(
  "purchaseOrders/create",
  (payload) => api.post(ENDPOINT, payload).then(changed)
)

export const updatePurchaseOrder = createApiThunk<{ id: string; payload: PurchaseOrderUpdatePayload }, PurchaseOrder>(
  "purchaseOrders/update",
  ({ id, payload }) => api.patch(`${ENDPOINT}${id}/`, payload).then(changed)
)

export const submitPurchaseOrder = createActionThunk<PurchaseOrder>("purchaseOrders/submit", ENDPOINT, "submit")
export const cancelPurchaseOrder = createActionThunk<PurchaseOrder>("purchaseOrders/cancel", ENDPOINT, "cancel")

// Line endpoints return just the line; callers refetch the PO afterwards so totals and
// the header stay authoritative.
export const addPurchaseOrderLine = createApiThunk<{ poId: string; payload: PurchaseOrderLineInput }, PurchaseOrderLine>(
  "purchaseOrders/addLine",
  ({ poId, payload }) => api.post(`${ENDPOINT}${poId}/lines/`, payload).then(changed)
)

export const updatePurchaseOrderLine = createApiThunk<
  { poId: string; lineId: string; payload: PurchaseOrderLineUpdate },
  PurchaseOrderLine
>("purchaseOrders/updateLine", ({ poId, lineId, payload }) => api.patch(`${ENDPOINT}${poId}/lines/${lineId}/`, payload).then(changed))

export const removePurchaseOrderLine = createAsyncThunk(
  "purchaseOrders/removeLine",
  async ({ poId, lineId }: { poId: string; lineId: string }, { rejectWithValue }) => {
    try {
      await api.delete(`${ENDPOINT}${poId}/lines/${lineId}/`)
      invalidateAllPages(ENDPOINT)
      return { poId, lineId }
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const purchaseOrderPdfUrl = (id: string) => `${ENDPOINT}${id}/pdf/`

export default withExtraCases(reducer, (builder) => {
  builder.addCase(createPurchaseOrder.fulfilled, (state, action) => {
    state.data = [action.payload, ...state.data]
    state.totalItems += 1
  })
  replaceOnFulfilled(builder, updatePurchaseOrder, submitPurchaseOrder, cancelPurchaseOrder)
})
