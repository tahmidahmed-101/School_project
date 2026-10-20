import campaignReducer from "./slices/campaignSlice"
import couponReducer from "./slices/couponSlice"
import saleReducer from "./slices/saleSlice"
import subscriberReducer from "./slices/subscriberSlice"
import suppressionReducer from "./slices/suppressionSlice"

export const marketingReducers = {
  campaigns: campaignReducer,
  coupons: couponReducer,
  sales: saleReducer,
  subscribers: subscriberReducer,
  emailSuppressions: suppressionReducer,
}
