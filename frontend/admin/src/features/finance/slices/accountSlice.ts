import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { Account } from "../types"

const ENDPOINT = "/admin/accounting/accounts/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Account>({
  name: "ledgerAccounts",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreAccount = createActionThunk<Account>("ledgerAccounts/restore", ENDPOINT, "restore")

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreAccount)
})
