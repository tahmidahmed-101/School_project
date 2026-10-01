import { createSliceFactory } from "@/lib/sliceFactory"
import type { LoginHistoryEntry } from "../types"

// /admin/audit/login-history/ (admin-only). search (email, user email, ip_address), ordering (created_at).
const { reducer, fetchAll } = createSliceFactory<LoginHistoryEntry>({
  name: "loginHistory",
  endpoint: "/admin/audit/login-history/",
})

export { fetchAll }

export default reducer
