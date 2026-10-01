import { createSliceFactory } from "@/lib/sliceFactory"
import type { StockReservation } from "../types"

const { reducer, fetchAll, deleteData } = createSliceFactory<StockReservation>({
  name: "stockReservations",
  endpoint: "/admin/orders/reservations/",
  initialSingleData: null,
})

export { fetchAll, deleteData }

export default reducer
