import warehouseReducer from "./slices/warehouseSlice"
import stockItemReducer from "./slices/stockItemSlice"
import preorderStockItemReducer from "./slices/preorderStockItemSlice"
import ledgerReducer from "./slices/ledgerSlice"
import reservationReducer from "./slices/reservationSlice"

export const inventoryReducers = {
  inventoryWarehouses: warehouseReducer,
  inventoryStockItems: stockItemReducer,
  inventoryPreorderStockItems: preorderStockItemReducer,
  inventoryLedger: ledgerReducer,
  stockReservations: reservationReducer,
}
