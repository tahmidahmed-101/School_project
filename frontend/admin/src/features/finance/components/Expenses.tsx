import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { DownloadIcon, Plus, Receipt, Tags } from "lucide-react"

import { Button } from "@/components/ui/button"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { exportToCSV } from "@/lib/ExportToCsv"
import { formatCurrency, formatDate } from "@/lib/format"
import { getApiErrorMessage } from "@/lib/api/client"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll, deleteData, postData, restoreExpense } from "../slices/expenseSlice"
import type { Account, Expense, ExpenseCategory } from "../types"
import { accountLabel, useAccounts, useCan, useDebouncedValue, useExpenseCategories } from "../hooks/useFinanceHelpers"
import { findAccount, findExpenseCategory, useImportLookup } from "../hooks/useImportLookups"
import { DateRangeInputs, RestoreButton, ShowDeletedToggle } from "./shared"
import { ExpenseFormDialog } from "./ExpenseFormDialog"
import { ExpenseDetailDialog } from "./ExpenseDetailDialog"

const PAGE_SIZE = 20

type Option = { label: string; value: string }

const Expenses = () => {
  useDocumentTitle("Expenses")

  const dispatch = useAppDispatch()
  const { data: expenses, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.expenses)
  const canPost = useCan("accounting.post")
  const { accounts, accountsById } = useAccounts()
  const { categories, categoriesById } = useExpenseCategories()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [category, setCategory] = useState<Option | null>(null)
  const [account, setAccount] = useState<Option | null>(null)
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")
  const [ordering, setOrdering] = useState<Option | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [viewing, setViewing] = useState<Expense | null>(null)

  const withPageReset = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value)
    setPage(1)
  }

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(category ? { category_id: category.value } : {}),
          ...(account ? { account_id: account.value } : {}),
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, category, account, start, end, ordering, includeDeleted]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const categoryOptions = useMemo<Option[]>(
    () => categories.map((c) => ({ label: c.name, value: c.id })),
    [categories]
  )
  const expenseAccountOptions = useMemo<Option[]>(
    () => accounts.filter((a) => a.type === "expense").map((a) => ({ label: accountLabel(a), value: a.id })),
    [accounts]
  )
  const accountLookup = useImportLookup<Account>("/admin/accounting/accounts/")
  const categoryLookup = useImportLookup<ExpenseCategory>("/admin/accounting/expense-categories/")
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

  const orderingOptions: Option[] = [
    { label: "Newest first", value: "-expense_date" },
    { label: "Oldest first", value: "expense_date" },
    { label: "Amount: high to low", value: "-amount" },
    { label: "Amount: low to high", value: "amount" },
  ]

  const handleDelete = async (expense: Expense) => {
    try {
      await dispatch(deleteData(expense.id)).unwrap()
      toast.success("Expense deleted")
      setViewing(null)
      if (includeDeleted) load()
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.expense_date)}</span>
      ),
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
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground whitespace-nowrap">{formatCurrency(row.original.amount)}</span>
      ),
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
        if (exp.deleted_at) {
          return canPost ? <RestoreButton label={exp.payee} onClick={() => handleRestore(exp)} /> : null
        }
        return (
          <TableActions
            itemName={exp.payee}
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

  const csvData = expenses.map((e) => ({
    Date: e.expense_date,
    Payee: e.payee,
    Description: e.description,
    Category: e.category_id ? categoriesById.get(e.category_id)?.name ?? "" : "",
    ExpenseAccount: accountLabel(accountsById.get(e.expense_account_id), ""),
    PaidFrom: accountLabel(accountsById.get(e.payment_account_id), ""),
    Amount: e.amount,
    Reference: e.reference_number,
  }))

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading
          title="Expenses"
          description="Operating spend posted to the ledger. Each expense books a journal entry against its expense and payment accounts."
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" size="action" asChild>
            <Link to="/expenses/categories">
              <Tags className="size-5" /> Categories
            </Link>
          </Button>
          <Button variant="primary" size="action" onClick={() => exportToCSV(csvData, "Expenses")}>
            <DownloadIcon className="size-5" /> Export CSV
          </Button>
          {canPost && (
            <CsvImportButton
              entityName="expenses"
              fields={importFields}
              createRow={(payload) => dispatch(postData({ payload: payload as Partial<Expense> })).unwrap()}
              onComplete={() => {
                accountLookup.reset()
                categoryLookup.reset()
                load()
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
        </div>
      </div>

      <FilterToolbar
        searchPlaceholder="Search payee, description, reference..."
        searchValue={search}
        onSearchChange={withPageReset(setSearch)}
        datePicker={
          <DateRangeInputs
            idPrefix="expenses"
            start={start}
            end={end}
            onStartChange={withPageReset(setStart)}
            onEndChange={withPageReset(setEnd)}
          />
        }
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={categoryOptions}
                placeholder="Category"
                value={category}
                onValueChange={withPageReset(setCategory)}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={expenseAccountOptions}
                placeholder="Expense account"
                value={account}
                onValueChange={withPageReset(setAccount)}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={orderingOptions}
                placeholder="Sort"
                value={ordering}
                onValueChange={withPageReset(setOrdering)}
              />
            ),
          },
          ...(canPost
            ? [
                {
                  component: (
                    <ShowDeletedToggle
                      id="expenses-deleted"
                      checked={includeDeleted}
                      onCheckedChange={withPageReset(setIncludeDeleted)}
                    />
                  ),
                },
              ]
            : []),
        ]}
      />

      <DataTable
        columns={columns}
        data={expenses}
        isLoading={isFetchingList}
        error={error}
        onRetry={() => {
          load()
        }}
        manualPagination
        pageSize={PAGE_SIZE}
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(exp) => !exp.deleted_at && setViewing(exp)}
        emptyIcon={Receipt}
        emptyTitle="No expenses found"
        emptyDescription="No expenses match these filters."
        minWidth="1200px"
        columnWidths={["110px", "240px", "150px", "190px", "160px", "120px", "130px", "110px"]}
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
