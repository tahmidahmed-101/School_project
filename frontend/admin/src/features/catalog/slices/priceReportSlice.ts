import { createSliceFactory } from "@/lib/sliceFactory"
import type { PriceReport } from "../types"

// /admin/catalog/price-reports/ — list (filters: product_id, status, search) and
// PATCH {status, staff_note}. Customers report a wrong price on the storefront; staff-only.
const { reducer, fetchAll, patchData } = createSliceFactory<PriceReport>({
  name: "catalogPriceReports",
  endpoint: "/admin/catalog/price-reports/",
  initialSingleData: null,
})

export { fetchAll, patchData }

export default reducer
