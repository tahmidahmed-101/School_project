import couponReducer from "./slices/couponSlice"
import saleReducer from "./slices/saleSlice"
import subscriberReducer from "./slices/subscriberSlice"

export const marketingReducers = {
  coupons: couponReducer,
  sales: saleReducer,
  subscribers: subscriberReducer,
}
