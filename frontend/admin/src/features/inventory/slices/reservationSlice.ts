import { createSliceFactory } from "@/lib/sliceFactory"
import type { StockReservation } from "../types"

const { reducer, fetchAll } = createSliceFactory<StockReservation>({
  name: "stockReservations",
  endpoint: "/admin/orders/reservations/",
  initialSingleData: null,
})

export { fetchAll }

export default reducer
