import { createActionThunk, createSliceFactory, replaceOnFulfilled, withExtraCases } from "@/lib/sliceFactory"
import type { Coupon } from "../types"

// /admin/coupons/ — list filters: search (code), ordering (code, created_at, expires_at),
// include_deleted. DELETE is a soft delete; /{id}/restore/ brings it back.
const { reducer, fetchAll, fetchSingle, postData, patchData, deleteData } = createSliceFactory<Coupon>({
  name: "coupons",
  endpoint: "/admin/coupons/",
  initialSingleData: null,
})

export { fetchAll, fetchSingle, postData, patchData, deleteData }

export const restoreCoupon = createActionThunk<Coupon>("coupons/restore", "/admin/coupons/", "restore")

export default withExtraCases(reducer, (builder) => {
  replaceOnFulfilled(builder, restoreCoupon)
})
