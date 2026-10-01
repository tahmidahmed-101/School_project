import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import type { IPBlock } from "../types"

// /admin/risk/ip-blocklist/ — unpaginated array. POST blocks an IP; DELETE takes the address
// as a query param (?ip_address=) rather than an id path segment.
const { reducer, fetchAll, postData } = createSliceFactory<IPBlock>({
  name: "ipBlocks",
  endpoint: "/admin/risk/ip-blocklist/",
})

export { fetchAll, postData }

export const unblockIP = createAsyncThunk("ipBlocks/unblock", async (block: IPBlock, { rejectWithValue }) => {
  try {
    await api.delete("/admin/risk/ip-blocklist/", { params: { ip_address: block.ip_address } })
    return block.id
  } catch (err) {
    return rejectWithValue(extractApiError(err))
  }
})

export default withExtraCases(reducer, (builder) => {
  builder.addCase(unblockIP.fulfilled, (state, action) => {
    state.data = state.data.filter((b) => b.id !== action.payload)
    state.totalItems = Math.max(0, state.totalItems - 1)
  })
})
