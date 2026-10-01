import {
  createActionThunk,
  createApiThunk,
  createSliceFactory,
  replaceOnFulfilled,
  withExtraCases,
} from "@/lib/sliceFactory"
import { api } from "@/lib/api/client"
import type {
  VendorBill,
  VendorBillCreatePayload,
  VendorBillUpdatePayload,
  VendorPayment,
  VendorPaymentCreatePayload,
} from "../types"

const ENDPOINT = "/admin/procurement/vendor-bills/"

// Bills can't be deleted — only voided (which reverses their ledger postings).
const { reducer, fetchAll, fetchSingle } = createSliceFactory<VendorBill>({
  name: "vendorBills",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export { fetchAll, fetchSingle }

export const createVendorBill = createApiThunk<VendorBillCreatePayload, VendorBill>("vendorBills/create", (payload) =>
  api.post(ENDPOINT, payload)
)

export const updateVendorBill = createApiThunk<{ id: string; payload: VendorBillUpdatePayload }, VendorBill>(
  "vendorBills/update",
  ({ id, payload }) => api.patch(`${ENDPOINT}${id}/`, payload)
)

export const voidVendorBill = createActionThunk<VendorBill>("vendorBills/void", ENDPOINT, "void")

export const recordVendorPayment = createApiThunk<
  { billId: string; payload: VendorPaymentCreatePayload },
  VendorPayment
>("vendorBills/recordPayment", ({ billId, payload }) => api.post(`${ENDPOINT}${billId}/payments/`, payload))

export const vendorBillPdfUrl = (id: string) => `${ENDPOINT}${id}/pdf/`

export default withExtraCases(reducer, (builder) => {
  builder.addCase(createVendorBill.fulfilled, (state, action) => {
    state.data = [action.payload, ...state.data]
    state.totalItems += 1
  })
  replaceOnFulfilled(builder, updateVendorBill, voidVendorBill)
})
