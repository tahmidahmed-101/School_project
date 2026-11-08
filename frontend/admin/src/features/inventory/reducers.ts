import warehouseReducer from "./slices/warehouseSlice"
import stockItemReducer from "./slices/stockItemSlice"
import ledgerReducer from "./slices/ledgerSlice"
import reservationReducer from "./slices/reservationSlice"
import transferReducer from "./slices/transferSlice"

export const inventoryReducers = {
  inventoryWarehouses: warehouseReducer,
  inventoryStockItems: stockItemReducer,
  inventoryLedger: ledgerReducer,
  stockReservations: reservationReducer,
  inventoryTransfers: transferReducer,
}
