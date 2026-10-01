import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type {
  VendorBill,
  VendorBillCreatePayload,
  VendorBillUpdatePayload,
  VendorPayment,
  VendorPaymentCreatePayload,
} from "../types"
import { createActionThunk } from "./restore"

const ENDPOINT = "/admin/procurement/vendor-bills/"

// Bills can't be deleted — only voided (which reverses their ledger postings).
const { reducer, fetchAll, fetchSingle } = createSliceFactory<VendorBill>({
  name: "vendorBills",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const createVendorBill = createAsyncThunk(
  "vendorBills/create",
  async (payload: VendorBillCreatePayload, { rejectWithValue }) => {
    try {
      const res = await api.post(ENDPOINT, payload)
      return unwrapItem<VendorBill>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const updateVendorBill = createAsyncThunk(
  "vendorBills/update",
  async ({ id, payload }: { id: string; payload: VendorBillUpdatePayload }, { rejectWithValue }) => {
    try {
      const res = await api.patch(`${ENDPOINT}${id}/`, payload)
      return unwrapItem<VendorBill>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const voidVendorBill = createActionThunk<VendorBill>("vendorBills/void", ENDPOINT, "void")

export const recordVendorPayment = createAsyncThunk(
  "vendorBills/recordPayment",
  async ({ billId, payload }: { billId: string; payload: VendorPaymentCreatePayload }, { rejectWithValue }) => {
    try {
      const res = await api.post(`${ENDPOINT}${billId}/payments/`, payload)
      return unwrapItem<VendorPayment>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export const vendorBillPdfUrl = (id: string) => `${ENDPOINT}${id}/pdf/`

type State = ReturnType<typeof reducer>

function replaceBill(state: State, bill: VendorBill) {
  state.data = state.data.map((b) => (b.id === bill.id ? bill : b))
  const single = state.singleData as VendorBill | null
  if (single && single.id === bill.id) state.singleData = bill
}

export default withExtraCases(reducer, (builder) => {
  builder
    .addCase(createVendorBill.fulfilled, (state, action) => {
      state.data = [action.payload, ...state.data]
      state.totalItems += 1
    })
    .addCase(updateVendorBill.fulfilled, (state, action) => replaceBill(state, action.payload))
    .addCase(voidVendorBill.fulfilled, (state, action) => replaceBill(state, action.payload))
})
