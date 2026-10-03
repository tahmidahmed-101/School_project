import { createSliceFactory } from "@/lib/sliceFactory"
import type { CustomerCart } from "../types"

// Read-only on the backend: carts are only ever changed by their customers.
const { reducer, fetchAll } = createSliceFactory<CustomerCart>({
  name: "customerCarts",
  endpoint: "/admin/orders/carts/",
  initialSingleData: null,
})

export { fetchAll }

export default reducer
