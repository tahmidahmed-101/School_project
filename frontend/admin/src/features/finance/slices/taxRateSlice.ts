import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import type { TaxRate } from "../types"
import { createRestoreThunk } from "./restore"

const ENDPOINT = "/admin/accounting/tax-rates/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<TaxRate>({
  name: "taxRates",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreTaxRate = createRestoreThunk<TaxRate>("taxRates", ENDPOINT)

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreTaxRate.fulfilled, (state, action) => {
    state.data = state.data.map((item) => (item.id === action.payload.id ? action.payload : item))
  })
})
