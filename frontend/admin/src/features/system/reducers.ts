import businessSettingsReducer from "./slices/businessSettingsSlice"
import auditLogReducer from "../audit/slices/auditLogSlice"
import loginHistoryReducer from "../audit/slices/loginHistorySlice"

export const systemReducers = {
  businessSettings: businessSettingsReducer,
  auditLogs: auditLogReducer,
  loginHistory: loginHistoryReducer,
}
