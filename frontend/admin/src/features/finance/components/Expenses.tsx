import { useMemo, useState } from "react"
import type { DateRange } from "react-day-picker"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Receipt } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { ExportButton } from "@/components/common/ExportButton"
import { SortSelect } from "@/components/common/SortSelect"
import { DatePicker } from "@/components/common/DatePicker"
import { toISODate } from "@/lib/format"
import { DateCell, MoneyCell } from "@/components/common/cells"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { exportToCSV } from "@/lib/csv"
import { fetchAllPages } from "@/lib/api/fetchAll"
import type { Option } from "@/lib/types"
import { getApiErrorMessage } from "@/lib/api/client"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"

import { fetchAll, deleteData, postData, restoreExpense } from "../slices/expenseSlice"
import type { Expense } from "../types"
import { accountLabel, useAccounts, useExpenseCategories } from "../hooks/useFinanceHelpers"
import { findAccount, findExpenseCategory, useFinanceImportLookups } from "../hooks/useImportLookups"
import { ExpenseFormDialog } from "./ExpenseFormDialog"
import { ExpenseDetailDialog } from "./ExpenseDetailDialog"

const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-expense_date" },
  { label: "Oldest first", value: "expense_date" },
  { label: "Amount: high to low", value: "-amount" },
  { label: "Amount: low to high", value: "amount" },
]

const Expenses = () => {
  useDocumentTitle("Expenses")

  const dispatch = useAppDispatch()
  const listState = useAppSelector((state) => state.expenses)
  const expenses = listState.data
  const canPost = useCan("accounting.post")
  const { accounts, accountsById } = useAccounts()
  const { categories, categoriesById } = useExpenseCategories()

  const [category, setCategory] = useState<Option | null>(null)
  const [account, setAccount] = useState<Option | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const from = dateRange?.from
  const to = dateRange?.to ?? dateRange?.from
  const [ordering, setOrdering] = useState<Option | null>(null)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [viewing, setViewing] = useState<Expense | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: listState,
    params: {
      category_id: category?.value,
      account_id: account?.value,
      start: from ? toISODate(from) : undefined,
      end: to ? toISODate(to) : undefined,
      ordering: ordering?.value,
    },
  })

  const categoryOptions = useMemo<Option[]>(
    () => categories.map((c) => ({ label: c.name, value: c.id })),
    [categories]
  )
  const expenseAccountOptions = useMemo<Option[]>(
    () => accounts.filter((a) => a.type === "expense").map((a) => ({ label: accountLabel(a), value: a.id })),
    [accounts]
  )
  const { accountLookup, categoryLookup } = useFinanceImportLookups()
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "expense_date", label: "Date", required: true, type: "date", aliases: ["Expense date"], example: "2026-09-15" },
      { key: "payee", label: "Payee", required: true, aliases: ["Vendor", "Paid to"], example: "Dhaka Electric Supply Co." },
      { key: "amount", label: "Amount", required: true, type: "number", aliases: ["Amount (BDT)", "Total"], example: "4500.00" },
      {
        key: "payment_account_id",
        label: "Payment account",
        required: true,
        aliases: ["Paid from", "PaidFrom"],
        example: "1200",
        resolve: async (raw) => findAccount(raw, await accountLookup.get(), { what: "Payment account" }),
      },
      {
        key: "expense_account_id",
        label: "Expense account",
        aliases: ["ExpenseAccount"],
        example: "6200",
        resolve: async (raw) =>
          findAccount(raw, await accountLookup.get(), { type: "expense", what: "Expense account" }),
      },
      {
        key: "category_id",
        label: "Category",
        aliases: ["Expense category"],
        example: "Utilities",
        resolve: async (raw) => findExpenseCategory(raw, await categoryLookup.get()),
      },
      { key: "description", label: "Description", aliases: ["Notes", "Memo"], example: "September electricity bill (DESCO)" },
      { key: "reference_number", label: "Reference", aliases: ["Reference number", "Ref"], example: "DESCO-2026-09" },
    ],
    [accountLookup, categoryLookup]
  )

  const handleDelete = async (expense: Expense) => {
    try {
      await dispatch(deleteData(expense.id)).unwrap()
      toast.success("Expense deleted")
      setViewing(null)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete expense"))
    }
  }

  const handleRestore = async (expense: Expense) => {
    try {
      await dispatch(restoreExpense(expense.id)).unwrap()
      toast.success("Expense restored")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore expense"))
    }
  }

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "expense_date",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.expense_date} className="text-muted-foreground" />,
    },
    {
      accessorKey: "payee",
      header: "PAYEE",
      cell: ({ row }) => (
        <div className="min-w-0 pr-3">
          <p className="text-sm font-semibold text-foreground truncate">{row.original.payee}</p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      id: "category",
      header: "CATEGORY",
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.category_id ? categoriesById.get(row.original.category_id)?.name ?? "—" : "Uncategorised"}
        </span>
      ),
    },
    {
      id: "expense_account",
      header: "EXPENSE ACCOUNT",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{accountLabel(accountsById.get(row.original.expense_account_id))}</span>
      ),
    },
    {
      id: "payment_account",
      header: "PAID FROM",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{accountLabel(accountsById.get(row.original.payment_account_id))}</span>
      ),
    },
    {
      accessorKey: "amount",
      header: "AMOUNT",
      cell: ({ row }) => <MoneyCell value={row.original.amount} emphasis className="text-foreground" />,
    },
    {
      accessorKey: "reference_number",
      header: "REFERENCE",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" />
        ) : (
          <span className="text-xs font-mono text-muted-foreground">{row.original.reference_number || "—"}</span>
        ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const exp = row.original
        return (
          <TableActions
            itemName={exp.payee}
            deleted={!!exp.deleted_at}
            onRestore={canPost ? () => handleRestore(exp) : undefined}
            onView={() => setViewing(exp)}
            onEdit={
              canPost
                ? () => {
                    setEditing(exp)
                    setIsFormOpen(true)
                  }
                : undefined
            }
            onDelete={canPost ? () => handleDelete(exp) : undefined}
          />
        )
      },
    },
  ]

  const exportAll = async () => {
    const rows = await fetchAllPages<Expense>("/admin/accounting/expenses/", list.query)
    exportToCSV(
      rows.map((e) => ({
        Date: e.expense_date,
        Payee: e.payee,
        Description: e.description,
        Category: e.category_id ? categoriesById.get(e.category_id)?.name ?? "" : "",
        ExpenseAccount: accountLabel(accountsById.get(e.expense_account_id), ""),
        PaidFrom: accountLabel(accountsById.get(e.payment_account_id), ""),
        Amount: e.amount,
        Reference: e.reference_number,
      })),
      "Expenses"
    )
  }

  return (
    <div className="section-container">
      <PageHeader
        title="Expenses"
        actions={
          <>
            <ExportButton onExport={exportAll} />
            {canPost && (
              <CsvImportButton
                entityName="expenses"
                fields={importFields}
                createRow={(payload) => dispatch(postData({ payload: payload as Partial<Expense> })).unwrap()}
                onComplete={() => {
                  accountLookup.reset()
                  categoryLookup.reset()
                  list.reload()
                }}
              />
            )}
            {canPost && (
              <Button
                size="action"
                onClick={() => {
                  setEditing(null)
                  setIsFormOpen(true)
                }}
              >
                <Plus className="size-5" /> Record Expense
              </Button>
            )}
          </>
        }
      />

      <FilterToolbar
        searchPlaceholder="Search payee, description, reference..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        datePicker={<DatePicker value={dateRange} onChange={setDateRange} />}
        filters={[
          {
            component: (
              <Combobox
                options={categoryOptions}
                placeholder="Category"
                value={category}
                onValueChange={setCategory}
              />
            ),
          },
          {
            component: (
              <Combobox
                options={expenseAccountOptions}
                placeholder="Expense account"
                value={account}
                onValueChange={setAccount}
              />
            ),
          },
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canPost
            ? { noun: "expense", deleteRow: (e) => dispatch(deleteData(e.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={expenses}
        {...list.tableProps}
        onRowClick={(exp) => !exp.deleted_at && setViewing(exp)}
        emptyIcon={Receipt}
        emptyTitle="No expenses found"
        emptyDescription="No expenses match these filters."
        minWidth="1200px"
        columnWidths={["110px", "240px", "150px", "190px", "160px", "120px", "130px", "80px"]}
      />

      <ExpenseFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        expense={editing}
        accounts={accounts}
        categories={categories}
      />

      <ExpenseDetailDialog
        expense={viewing}
        accountsById={accountsById}
        categoriesById={categoriesById}
        canPost={canPost}
        onClose={() => setViewing(null)}
        onEdit={(exp) => {
          setViewing(null)
          setEditing(exp)
          setIsFormOpen(true)
        }}
        onDelete={handleDelete}
      />
    </div>
  )
}

export default Expenses
