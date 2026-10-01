import orderReducer from "./slices/orderSlice"
import paymentReducer from "../payments/slices/paymentSlice"
import returnReducer from "../returns/slices/returnSlice"
import shipmentReducer from "../shipping/slices/shipmentSlice"
import carrierReducer from "../shipping/slices/carrierSlice"
import zoneReducer from "../shipping/slices/zoneSlice"
import rateReducer from "../shipping/slices/rateSlice"

export const salesReducers = {
  orders: orderReducer,
  payments: paymentReducer,
  returns: returnReducer,
  shipments: shipmentReducer,
  carriers: carrierReducer,
  shippingZones: zoneReducer,
  shippingRates: rateReducer,
}
