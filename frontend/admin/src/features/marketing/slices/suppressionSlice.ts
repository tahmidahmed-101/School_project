import { createSliceFactory } from "@/lib/sliceFactory"
import type { EmailSuppression } from "../types"

// /admin/marketing/suppressions/ — list filters: search (email), reason, ordering (created_at,
// email). POST { email, note } blocks an address; DELETE /{id}/ lifts the block (204).
const { reducer, fetchAll, postData, deleteData } = createSliceFactory<EmailSuppression>({
  name: "emailSuppressions",
  endpoint: "/admin/marketing/suppressions/",
})

export { fetchAll, postData, deleteData }

export default reducer
