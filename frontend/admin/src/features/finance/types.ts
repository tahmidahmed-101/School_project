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

/** Which half an entry belongs to; blank is the whole business (rent, salaries, owner money). */
export type JournalEntryKind = "stock" | "preorder" | ""

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
  kind: JournalEntryKind
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
  kind?: JournalEntryKind
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

type ReportKind = "stock" | "preorder"

/** Whole business; `unassigned_*` sit on entries not marked stock or pre-order. */
export interface ProfitAndLossReport {
  revenue: number
  cost_of_goods_sold: number
  gross_profit: number
  operating_expenses: number
  net_income: number
  unassigned_revenue: number
  unassigned_cost_of_goods_sold: number
}

/** One half; `company_wide_left_out` names what is not split. */
export interface KindProfitAndLossReport {
  kind: ReportKind
  revenue: number
  cost_of_goods_sold: number
  gross_profit: number
  other_costs: number
  company_wide_left_out: string[]
}

export interface BalanceSheetReport {
  assets: number
  liabilities: number
  contributed_equity: number
  retained_earnings: number
  equity: number
  inventory_asset: number
}

export interface KindBalanceSheetReport {
  kind: ReportKind
  inventory_asset: number
  accounts_receivable: number
  refund_payable: number
  customer_balance: number
  accounts_payable: number
  goods_received_not_billed: number
  company_wide_left_out: string[]
}

export interface CashFlowReport {
  net_change_in_cash: number
  company_wide: number
}

export interface KindCashFlowReport {
  kind: ReportKind
  customer_receipts: number
  customer_refunds: number
  supplier_payments: number
  other: number
  net_change_in_cash: number
  company_wide_left_out: string[]
}

/** Asked with `kind`, so the ledger figures are for that half only. */
export interface InventoryValuationReport {
  inventory_value: number
  ledger_inventory_asset: number
  ledger_difference: number
}
