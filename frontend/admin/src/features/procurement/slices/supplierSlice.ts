import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { Supplier } from "../types"

const ENDPOINT = "/admin/procurement/suppliers/"

const { reducer, fetchAll, postData, patchData, deleteData } = createSliceFactory<Supplier>({
  name: "suppliers",
  endpoint: ENDPOINT,
  initialSingleData: null,
})

export const restoreSupplier = createActionThunk<Supplier>("suppliers/restore", ENDPOINT, "restore")

export { fetchAll, postData, patchData, deleteData }

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreSupplier)
})
