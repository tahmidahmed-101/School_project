import { createSliceFactory } from "@/lib/sliceFactory"
import type { NewsletterSubscriber } from "../types"

// /admin/marketing/subscribers/ — list filters: search (email), ordering (created_at, email),
// is_active. PATCH/DELETE on /{id}/ (DELETE is a hard delete, 204). CSV at /export/.
const { reducer, fetchAll, postData, patchData, deleteData } = createSliceFactory<NewsletterSubscriber>({
  name: "subscribers",
  endpoint: "/admin/marketing/subscribers/",
})

export { fetchAll, postData, patchData, deleteData }

export default reducer
