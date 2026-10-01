import { api } from "@/lib/api/client"
import { createApiThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { PhoneBlock } from "../types"

// /admin/risk/phone-blocklist/ — unpaginated array; ?include_lifted=true adds lifted blocks.
// Blocks are never deleted, only lifted via POST /{phone_number}/lift/ {reason}.
const { reducer, fetchAll, postData } = createSliceFactory<PhoneBlock>({
  name: "phoneBlocks",
  endpoint: "/admin/risk/phone-blocklist/",
})

export { fetchAll, postData }

export const liftPhoneBlock = createApiThunk<{ phone_number: string; reason: string }, PhoneBlock>(
  "phoneBlocks/lift",
  ({ phone_number, reason }) =>
    api.post(`/admin/risk/phone-blocklist/${encodeURIComponent(phone_number)}/lift/`, { reason })
)

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, liftPhoneBlock)
})
