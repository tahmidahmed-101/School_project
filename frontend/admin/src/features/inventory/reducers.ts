import warehouseReducer from "./slices/warehouseSlice"
import stockItemReducer from "./slices/stockItemSlice"
import ledgerReducer from "./slices/ledgerSlice"
import reservationReducer from "./slices/reservationSlice"

export const inventoryReducers = {
  inventoryWarehouses: warehouseReducer,
  inventoryStockItems: stockItemReducer,
  inventoryLedger: ledgerReducer,
  stockReservations: reservationReducer,
}
