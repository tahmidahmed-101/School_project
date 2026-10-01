import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import type { Account } from "../types"
import { createRestoreThunk } from "./restore"

const ENDPOINT = "/admin/accounting/accounts/"

const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Account>({
  name: "ledgerAccounts",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreAccount = createRestoreThunk<Account>("ledgerAccounts", ENDPOINT)

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreAccount.fulfilled, (state, action) => {
    state.data = state.data.map((item) => (item.id === action.payload.id ? action.payload : item))
  })
})
