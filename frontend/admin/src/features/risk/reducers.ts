import fraudCaseReducer from "./slices/fraudCaseSlice"
import ipBlockReducer from "./slices/ipBlockSlice"
import phoneBlockReducer from "./slices/phoneBlockSlice"

export const riskReducers = {
  fraudCases: fraudCaseReducer,
  ipBlocks: ipBlockReducer,
  phoneBlocks: phoneBlockReducer,
}

/** State shape this domain adds to the store (used by selectors until/unless RootState includes it). */
export interface RiskState {
  fraudCases: ReturnType<typeof fraudCaseReducer>
  ipBlocks: ReturnType<typeof ipBlockReducer>
  phoneBlocks: ReturnType<typeof phoneBlockReducer>
}
