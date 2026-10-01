import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { Expense } from "../types"

const ENDPOINT = "/admin/accounting/expenses/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Expense>({
  name: "expenses",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreExpense = createActionThunk<Expense>("expenses/restore", ENDPOINT, "restore")

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreExpense)
})
