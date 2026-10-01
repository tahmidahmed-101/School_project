import couponReducer from "./slices/couponSlice"
import subscriberReducer from "./slices/subscriberSlice"

export const marketingReducers = {
  coupons: couponReducer,
  subscribers: subscriberReducer,
}
