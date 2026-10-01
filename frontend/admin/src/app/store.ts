import { configureStore } from "@reduxjs/toolkit"

import authReducer from "@/features/authentication/slices/authSlice"
import { dashboardReducers } from "@/features/dashboard/reducers"
import { catalogReducers } from "@/features/catalog/reducers"
import { inventoryReducers } from "@/features/inventory/reducers"
import { salesReducers } from "@/features/sales/reducers"
import { financeReducers } from "@/features/finance/reducers"
import { usersReducers } from "@/features/users/reducers"
import { marketingReducers } from "@/features/marketing/reducers"
import { systemReducers } from "@/features/system/reducers"
import { riskReducers } from "@/features/risk/reducers"
import { procurementReducers } from "@/features/procurement/reducers"

// Each domain owns a reducer map in src/features/<domain>/reducers.ts; register new
// domains here (keys must be unique across domains).
export const store = configureStore({
  reducer: {
    auth: authReducer,
    ...dashboardReducers,
    ...catalogReducers,
    ...inventoryReducers,
    ...salesReducers,
    ...procurementReducers,
    ...financeReducers,
    ...usersReducers,
    ...marketingReducers,
    ...riskReducers,
    ...systemReducers,
  },
  devTools: import.meta.env.DEV,
})

export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
