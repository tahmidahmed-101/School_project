import orderReducer from "./slices/orderSlice"
import cartReducer from "./slices/cartSlice"
import paymentReducer from "../payments/slices/paymentSlice"
import returnReducer from "../returns/slices/returnSlice"
import shipmentReducer from "../shipping/slices/shipmentSlice"
import carrierReducer from "../shipping/slices/carrierSlice"
import zoneReducer from "../shipping/slices/zoneSlice"
import rateReducer from "../shipping/slices/rateSlice"

export const salesReducers = {
  orders: orderReducer,
  customerCarts: cartReducer,
  payments: paymentReducer,
  returns: returnReducer,
  shipments: shipmentReducer,
  carriers: carrierReducer,
  shippingZones: zoneReducer,
  shippingRates: rateReducer,
}
