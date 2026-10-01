import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import type { Supplier } from "../types"
import { createActionThunk } from "./restore"

const ENDPOINT = "/admin/procurement/suppliers/"

const { reducer, fetchAll, postData, patchData, deleteData } = createSliceFactory<Supplier>({
  name: "suppliers",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreSupplier = createActionThunk<Supplier>("suppliers/restore", ENDPOINT, "restore")

export { fetchAll, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  builder.addCase(restoreSupplier.fulfilled, (state, action) => {
    state.data = state.data.map((s) => (s.id === action.payload.id ? action.payload : s))
  })
})
