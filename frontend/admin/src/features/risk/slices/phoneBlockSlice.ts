import { createAsyncThunk } from "@reduxjs/toolkit"
import { createSliceFactory, withExtraCases } from "@/lib/sliceFactory"
import { api, extractApiError } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import type { PhoneBlock } from "../types"

// /admin/risk/phone-blocklist/ — unpaginated array; ?include_lifted=true adds lifted blocks.
// Blocks are never deleted, only lifted via POST /{phone_number}/lift/ {reason}.
const { reducer, fetchAll, postData } = createSliceFactory<PhoneBlock>({
  name: "phoneBlocks",
  endpoint: "/admin/risk/phone-blocklist/",
})

export { fetchAll, postData }

export const liftPhoneBlock = createAsyncThunk(
  "phoneBlocks/lift",
  async ({ phone_number, reason }: { phone_number: string; reason: string }, { rejectWithValue }) => {
    try {
      const res = await api.post(`/admin/risk/phone-blocklist/${encodeURIComponent(phone_number)}/lift/`, { reason })
      return unwrapItem<PhoneBlock>(res.data)
    } catch (err) {
      return rejectWithValue(extractApiError(err))
    }
  }
)

export default withExtraCases(reducer, (builder) => {
  builder.addCase(liftPhoneBlock.fulfilled, (state, action) => {
    state.data = state.data.map((b) => (b.id === action.payload.id ? action.payload : b))
  })
})
