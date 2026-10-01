import { createSliceFactory } from "@/lib/sliceFactory"
import type { AuditLog } from "../types"

// /admin/audit/ (admin-only, read-only). Reads only search (action, target_type, actor email)
// and ordering (created_at, action). CSV of the same query at /admin/audit/export/.
const { reducer, fetchAll } = createSliceFactory<AuditLog>({
  name: "auditLogs",
  endpoint: "/admin/audit/",
})

export { fetchAll }

export default reducer
