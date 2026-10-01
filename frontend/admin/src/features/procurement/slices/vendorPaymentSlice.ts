import { createSliceFactory } from "@/lib/sliceFactory"
import type { VendorPayment } from "../types"

// Read-only ledger of payments; new payments are recorded against a bill
// (see recordVendorPayment in vendorBillSlice).
const { reducer, fetchAll } = createSliceFactory<VendorPayment>({
  name: "vendorPayments",
  endpoint: "/admin/procurement/vendor-payments/",
  initialSingleData: null,
})

export { fetchAll }
export default reducer
