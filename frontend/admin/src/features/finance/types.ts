// Mirrors kull-mart api/v1/admin/accounting/serializers.py. Decimals arrive as strings.

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense"

/** AccountSerializer */
export interface Account {
  id: string
  code: string
  name: string
  type: AccountType
  parent_id: string | null
  is_active: boolean
  deleted_at: string | null
}

/** AccountCreateSerializer / AccountUpdateSerializer */
export interface AccountPayload {
  code?: string
  name?: string
  type?: AccountType
  parent_id?: string | null
  is_active?: boolean
}

export type JournalEntryStatus = "draft" | "posted"

/** JournalEntryLineSerializer */
export interface JournalEntryLine {
  id: string
  account_id: string
  debit: string
  credit: string
}

/** JournalEntrySerializer */
export interface JournalEntry {
  id: string
  entry_date: string
  reference_type: string
  reference_id: string | null
  status: JournalEntryStatus
  description: string
  reverses_id: string | null
  reversed_by_id: string | null
  lines: JournalEntryLine[]
}

/** JournalEntryCreateSerializer */
export interface JournalEntryCreatePayload {
  entry_date: string
  reference_type?: string
  reference_id?: string | null
  description?: string
  lines: { account_id: string; debit?: string; credit?: string }[]
}

/** JournalEntryReverseSerializer */
export interface JournalEntryReversePayload {
  entry_date?: string
  reason?: string
}

/** TaxRateSerializer */
export interface TaxRate {
  id: string
  name: string
  rate_percent: string
  region: string
  is_active: boolean
  is_default: boolean
  deleted_at: string | null
}

/** TaxRateCreateSerializer / TaxRateUpdateSerializer */
export interface TaxRatePayload {
  name?: string
  rate_percent?: string
  region?: string
  is_active?: boolean
  is_default?: boolean
}

/** ExpenseCategorySerializer */
export interface ExpenseCategory {
  id: string
  name: string
  description: string
  expense_account_id: string
  is_active: boolean
  deleted_at: string | null
}

/** ExpenseCategoryCreateSerializer / ExpenseCategoryUpdateSerializer */
export interface ExpenseCategoryPayload {
  name?: string
  description?: string
  expense_account_id?: string | null
  is_active?: boolean
}

/** ExpenseSerializer */
export interface Expense {
  id: string
  expense_date: string
  payee: string
  description: string
  amount: string
  expense_account_id: string
  category_id: string | null
  payment_account_id: string
  reference_number: string
  journal_entry_id: string | null
  deleted_at: string | null
}

/** ExpenseCreateSerializer */
export interface ExpenseCreatePayload {
  expense_date: string
  payee: string
  description?: string
  amount: string
  expense_account_id?: string | null
  category_id?: string | null
  payment_account_id: string
  reference_number?: string
}

/** ExpenseUpdateSerializer — amount/date/accounts are frozen once posted. */
export interface ExpenseUpdatePayload {
  payee?: string
  description?: string
  reference_number?: string
}

// Reports (apps/accounting/selectors/reports.py) — amounts are JSON numbers.

export interface ProfitAndLossReport {
  revenue: number
  cost_of_goods_sold: number
  gross_profit: number
  operating_expenses: number
  net_income: number
}

export interface BalanceSheetReport {
  assets: number
  liabilities: number
  contributed_equity: number
  retained_earnings: number
  equity: number
  inventory_asset: number
}

export interface CashFlowReport {
  net_change_in_cash: number
}

export interface InventoryValuationReport {
  inventory_value: number
}
