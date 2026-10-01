import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import type { Expense } from "../types"
import { createRestoreThunk } from "./restore"

const ENDPOINT = "/admin/accounting/expenses/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Expense>({
  name: "expenses",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreExpense = createRestoreThunk<Expense>("expenses", ENDPOINT)

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreExpense.fulfilled, (state, action) => {
    state.data = state.data.map((item) => (item.id === action.payload.id ? action.payload : item))
  })
})
