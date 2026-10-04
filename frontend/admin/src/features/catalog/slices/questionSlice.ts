import { createSliceFactory } from "@/lib/sliceFactory"
import type { ProductQuestion } from "../types"

// /admin/catalog/questions/ — list (filters: product_id, status, search), PATCH {answer, is_published}
// and delete. Customers ask on the storefront; a question shows there once answered and published.
const { reducer, fetchAll, patchData, deleteData } = createSliceFactory<ProductQuestion>({
  name: "catalogQuestions",
  endpoint: "/admin/catalog/questions/",
  initialSingleData: null,
})

export { fetchAll, patchData, deleteData }

export default reducer
