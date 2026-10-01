import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { RootState } from "@/app/store"
import type { Order, OrderCreatePayload, OrderStatus, OrderUpdatePayload } from "../types"
import type { PaymentMethod } from "@/features/payments/types"
import type { Rma, CreateRmaPayload } from "@/features/returns/types"
import type { CreateShipmentPayload, Shipment } from "@/features/shipping/types"

const ENDPOINT = "/admin/orders/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Order>({
  name: "orders",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

/** The loaded order (state.orders.singleData). */
export const selectOrderDetail = (state: RootState): Order | null =>
  (state.orders.singleData as Order | null) ?? null

/** Fetches one order without touching the slice (for pages that only need a lookup). */
export const fetchOrderById = createAsyncThunk("orders/fetchOrderById", async (id: string, { rejectWithValue }) => {
  try {
    const res = await api.get(`${ENDPOINT}${id}/`)
    return unwrapItem<Order>(res.data)
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

/** Builds a thunk for an order action endpoint that responds with the updated order. */
function orderAction<Arg>(type: string, request: (arg: Arg) => Promise<{ data: unknown }>) {
  return createAsyncThunk(`orders/${type}`, async (arg: Arg, { rejectWithValue }) => {
    try {
      const res = await request(arg)
      return unwrapItem<Order>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  })
}

export const createOrder = createAsyncThunk(
  "orders/createOrder",
  async (payload: OrderCreatePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<Order>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const updateOrder = orderAction("updateOrder", ({ id, payload }: { id: string; payload: OrderUpdatePayload }) =>
  api.patch(`${ENDPOINT}${id}/`, payload)
)

export const updateOrderStatus = orderAction(
  "updateOrderStatus",
  ({ id, status }: { id: string; status: OrderStatus }) => api.post(`${ENDPOINT}${id}/status/`, { status })
)

export const cancelOrder = orderAction("cancelOrder", ({ id }: { id: string }) =>
  api.post(`${ENDPOINT}${id}/cancel/`)
)

export const capturePayment = orderAction(
  "capturePayment",
  ({ id, amount, method, reference }: { id: string; amount: string; method: PaymentMethod; reference?: string }) =>
    api.post(`${ENDPOINT}${id}/capture-payment/`, { amount, method, reference: reference ?? "" })
)

export const updateOrderLine = orderAction(
  "updateOrderLine",
  ({ orderId, lineId, quantity }: { orderId: string; lineId: string; quantity: number }) =>
    api.patch(`${ENDPOINT}${orderId}/lines/${lineId}/`, { quantity })
)

export const removeOrderLine = orderAction(
  "removeOrderLine",
  ({ orderId, lineId }: { orderId: string; lineId: string }) => api.delete(`${ENDPOINT}${orderId}/lines/${lineId}/`)
)

// These respond with the created/updated shipment or RMA, not the order — callers refetch
// the order afterwards so its shipments[] / rmas[] / line balances stay in sync.

export const createShipment = createAsyncThunk(
  "orders/createShipment",
  async ({ orderId, payload }: { orderId: string; payload: CreateShipmentPayload }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${orderId}/shipments/`, payload)
      return unwrapItem<Shipment>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const createReturn = createAsyncThunk(
  "orders/createReturn",
  async ({ orderId, payload }: { orderId: string; payload: CreateRmaPayload }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${orderId}/returns/`, payload)
      return unwrapItem<Rma>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

const orderReturningActions = [updateOrder, updateOrderStatus, cancelOrder, capturePayment, updateOrderLine, removeOrderLine]

export default withExtraCases(reducer, (builder) => {
  for (const action of orderReturningActions) {
    builder.addCase(action.fulfilled, (state, { payload }) => {
      const order = payload as Order
      state.data = state.data.map((o) => (o.id === order.id ? order : o)) as typeof state.data
      if ((state.singleData as Partial<Order> | null)?.id === order.id) {
        state.singleData = order as typeof state.singleData
      }
    })
  }
})
