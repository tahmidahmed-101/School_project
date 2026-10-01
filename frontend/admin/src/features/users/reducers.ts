import staffReducer from "./slices/staffSlice"
import customerReducer from "./slices/customerSlice"

export const usersReducers = {
  staffs: staffReducer,
  customers: customerReducer,
}
