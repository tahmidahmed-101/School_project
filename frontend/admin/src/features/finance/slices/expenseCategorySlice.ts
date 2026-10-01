import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { ExpenseCategory } from "../types"

const ENDPOINT = "/admin/accounting/expense-categories/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<ExpenseCategory>({
  name: "expenseCategories",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreExpenseCategory = createActionThunk<ExpenseCategory>("expenseCategories/restore", ENDPOINT, "restore")

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreExpenseCategory)
})
