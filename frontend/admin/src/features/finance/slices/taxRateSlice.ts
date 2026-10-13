import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { TaxRate } from "../types"

const ENDPOINT = "/admin/accounting/tax-rates/"

const { reducer, fetchAll, postData, patchData, deleteData } = createSliceFactory<TaxRate>({
  name: "taxRates",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreTaxRate = createActionThunk<TaxRate>("taxRates/restore", ENDPOINT, "restore")

export { fetchAll, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreTaxRate)
})
