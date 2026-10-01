import { createSliceFactory } from "@/lib/sliceFactory"
import type { VendorPayment } from "../types"

export const VENDOR_PAYMENTS_ENDPOINT = "/admin/procurement/vendor-payments/"

// Read-only ledger of payments; new payments are recorded against a bill
// (see recordVendorPayment in vendorBillSlice).
const { reducer, fetchAll } = createSliceFactory<VendorPayment>({
  name: "vendorPayments",
  endpoint: VENDOR_PAYMENTS_ENDPOINT,
  initialSingleData: null,
})

export { fetchAll }
export default reducer
