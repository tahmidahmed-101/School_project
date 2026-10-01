import expenseReducer from "./slices/expenseSlice"
import expenseCategoryReducer from "./slices/expenseCategorySlice"
import accountReducer from "./slices/accountSlice"
import journalEntryReducer from "./slices/journalEntrySlice"
import taxRateReducer from "./slices/taxRateSlice"

export const financeReducers = {
  expenses: expenseReducer,
  expenseCategories: expenseCategoryReducer,
  ledgerAccounts: accountReducer,
  journalEntries: journalEntryReducer,
  taxRates: taxRateReducer,
}
