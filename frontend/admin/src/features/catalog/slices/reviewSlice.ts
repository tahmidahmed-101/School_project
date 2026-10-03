import { createSliceFactory } from "@/lib/sliceFactory"
import type { ProductReview } from "../types"

// /admin/catalog/reviews/ — list (filters: product_id, rating, search) and delete only;
// customers write reviews on the storefront, staff moderate them here.
const { reducer, fetchAll, deleteData } = createSliceFactory<ProductReview>({
  name: "catalogReviews",
  endpoint: "/admin/catalog/reviews/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
