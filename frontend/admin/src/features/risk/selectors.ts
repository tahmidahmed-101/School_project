import type { RootState } from "@/app/store"
import type { RiskState } from "./reducers"

// The risk reducers are registered in src/app/store.ts by the coordinator; this cast keeps
// the selectors type-safe either way.
const risk = (state: RootState) => state as unknown as RiskState

export const selectFraudCases = (state: RootState) => risk(state).fraudCases
export const selectIPBlocks = (state: RootState) => risk(state).ipBlocks
export const selectPhoneBlocks = (state: RootState) => risk(state).phoneBlocks
