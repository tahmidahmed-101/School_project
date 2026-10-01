import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import type { ExpenseCategory } from "../types"
import { createRestoreThunk } from "./restore"

const ENDPOINT = "/admin/accounting/expense-categories/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<ExpenseCategory>({
  name: "expenseCategories",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreExpenseCategory = createRestoreThunk<ExpenseCategory>("expenseCategories", ENDPOINT)

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreExpenseCategory.fulfilled, (state, action) => {
    state.data = state.data.map((item) => (item.id === action.payload.id ? action.payload : item))
  })
})
