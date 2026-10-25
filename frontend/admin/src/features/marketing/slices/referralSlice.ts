import { createSliceFactory } from "@/lib/sliceFactory"
import type { Referral } from "../types"

// /admin/referrals/ — read-only list. Filters: search (order number, referrer phone or email),
// status (pending | rewarded | void), ordering (created_at, rewarded_at).
const { reducer, fetchAll } = createSliceFactory<Referral>({
  name: "referrals",
  endpoint: "/admin/referrals/",
})

export { fetchAll }

export default reducer
