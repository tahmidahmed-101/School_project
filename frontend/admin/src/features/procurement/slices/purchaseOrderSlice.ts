import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type {
  PurchaseOrder,
  PurchaseOrderCreatePayload,
  PurchaseOrderLine,
  PurchaseOrderLineInput,
  PurchaseOrderLineUpdate,
  PurchaseOrderUpdatePayload,
} from "../types"
import { createActionThunk } from "./restore"

const ENDPOINT = "/admin/procurement/purchase-orders/"

const { reducer, fetchAll, fetchSingle, deleteData } = createSliceFactory<PurchaseOrder>({
  name: "purchaseOrders",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle, deleteData }

export const createPurchaseOrder = createAsyncThunk(
  "purchaseOrders/create",
  async (payload: PurchaseOrderCreatePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<PurchaseOrder>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const updatePurchaseOrder = createAsyncThunk(
  "purchaseOrders/update",
  async ({ id, payload }: { id: string; payload: PurchaseOrderUpdatePayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      return unwrapItem<PurchaseOrder>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const submitPurchaseOrder = createActionThunk<PurchaseOrder>("purchaseOrders/submit", ENDPOINT, "submit")
export const cancelPurchaseOrder = createActionThunk<PurchaseOrder>("purchaseOrders/cancel", ENDPOINT, "cancel")

// Line endpoints return just the line; callers refetch the PO afterwards so totals and
// the header stay authoritative.
export const addPurchaseOrderLine = createAsyncThunk(
  "purchaseOrders/addLine",
  async ({ poId, payload }: { poId: string; payload: PurchaseOrderLineInput }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${poId}/lines/`, payload)
      return unwrapItem<PurchaseOrderLine>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const updatePurchaseOrderLine = createAsyncThunk(
  "purchaseOrders/updateLine",
  async (
    { poId, lineId, payload }: { poId: string; lineId: string; payload: PurchaseOrderLineUpdate },
    { rejectWithValue }
  ) => {
    try {
      const res = await api.patch(`${ENDPOINT}${poId}/lines/${lineId}/`, payload)
      return unwrapItem<PurchaseOrderLine>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const removePurchaseOrderLine = createAsyncThunk(
  "purchaseOrders/removeLine",
  async ({ poId, lineId }: { poId: string; lineId: string }, { rejectWithValue }) => {
    try {
      await api.delete(`${ENDPOINT}${poId}/lines/${lineId}/`)
      return { poId, lineId }
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const purchaseOrderPdfUrl = (id: string) => `${ENDPOINT}${id}/pdf/`

type State = ReturnType<typeof reducer>

function replacePo(state: State, po: PurchaseOrder) {
  state.data = state.data.map((p) => (p.id === po.id ? po : p))
  const single = state.singleData as PurchaseOrder | null
  if (single && single.id === po.id) state.singleData = po
}

export default withExtraCases(reducer, (builder) => {
  builder
    .addCase(createPurchaseOrder.fulfilled, (state, action) => {
      state.data = [action.payload, ...state.data]
      state.totalItems += 1
    })
    .addCase(updatePurchaseOrder.fulfilled, (state, action) => replacePo(state, action.payload))
    .addCase(submitPurchaseOrder.fulfilled, (state, action) => replacePo(state, action.payload))
    .addCase(cancelPurchaseOrder.fulfilled, (state, action) => replacePo(state, action.payload))
})
