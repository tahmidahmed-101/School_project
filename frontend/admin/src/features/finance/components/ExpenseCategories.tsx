import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeft, CheckCircle2, Loader2, Plus, Tags } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { deleteData, fetchAll, patchData, postData, restoreExpenseCategory } from "../slices/expenseCategorySlice"
import type { Account, ExpenseCategory, ExpenseCategoryPayload } from "../types"
import { accountLabel, useAccounts, useCan, useDebouncedValue } from "../hooks/useFinanceHelpers"
import { findAccount, useImportLookup } from "../hooks/useImportLookups"
import { RestoreButton, ShowDeletedToggle } from "./shared"

const PAGE_SIZE = 20
const NONE = "none"

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: z.string(),
  expense_account_id: z.string(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function CategoryFormDialog({
  open,
  onOpenChange,
  category,
  accounts,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  category: ExpenseCategory | null
  accounts: Account[]
}) {
  const dispatch = useAppDispatch()
  const {
    control,
    register,
    reset,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (open) {
      reset({
        name: category?.name ?? "",
        description: category?.description ?? "",
        expense_account_id: category?.expense_account_id ?? NONE,
        is_active: category?.is_active ?? true,
      })
    }
  }, [open, category, reset])

  const expenseAccounts = useMemo(() => accounts.filter((a) => a.type === "expense"), [accounts])

  const onSubmit = async (values: FormValues) => {
    const payload: ExpenseCategoryPayload = {
      name: values.name.trim(),
      description: values.description,
      ...(values.expense_account_id !== NONE ? { expense_account_id: values.expense_account_id } : {}),
      ...(category ? { is_active: values.is_active } : {}),
    }
    try {
      if (category) {
        await dispatch(patchData({ id: category.id, payload: payload as Partial<ExpenseCategory> })).unwrap()
        toast.success("Category updated")
      } else {
        await dispatch(postData({ payload: payload as Partial<ExpenseCategory> })).unwrap()
        toast.success("Category created")
      }
      onOpenChange(false)
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save category"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Edit Category" : "New Expense Category"}</DialogTitle>
          <DialogDescription>
            Each category maps to an expense account; leave it blank to use the general expense account.
          </DialogDescription>
        </DialogHeader>
        <form id="category-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
          <Field>
            <FieldLabel htmlFor="cat-name">Name *</FieldLabel>
            <FieldContent>
              <Input id="cat-name" aria-invalid={!!errors.name} {...register("name")} />
              <FieldError errors={[errors.name]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="cat-account">Expense account</FieldLabel>
            <FieldContent>
              <Controller
                control={control}
                name="expense_account_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="cat-account">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      {!category && <SelectItem value={NONE}>General expense (default)</SelectItem>}
                      {expenseAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {accountLabel(a)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldError errors={[errors.expense_account_id]} />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor="cat-desc">Description</FieldLabel>
            <FieldContent>
              <Textarea id="cat-desc" rows={2} {...register("description")} />
            </FieldContent>
          </Field>
          {category && (
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="cat-active" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="cat-active" className="text-sm">
                    Active (available when recording expenses)
                  </label>
                </div>
              )}
            />
          )}
        </form>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="category-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {category ? "Save Changes" : "Create Category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ExpenseCategories = () => {
  useDocumentTitle("Expense Categories")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.expenseCategories)
  const canPost = useCan("accounting.post")
  const { accounts, accountsById } = useAccounts()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseCategory | null>(null)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, includeDeleted]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const accountLookup = useImportLookup<Account>("/admin/accounting/accounts/")
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "name", label: "Name", required: true, aliases: ["Category", "Category name"], example: "Utilities" },
      {
        key: "expense_account_id",
        label: "Expense account",
        aliases: ["Account"],
        example: "6200",
        resolve: async (raw) =>
          findAccount(raw, await accountLookup.get(), { type: "expense", what: "Expense account" }),
      },
      { key: "description", label: "Description", example: "Electricity, water and gas bills" },
    ],
    [accountLookup]
  )

  const handleDelete = async (category: ExpenseCategory) => {
    try {
      await dispatch(deleteData(category.id)).unwrap()
      toast.success("Category deleted")
      if (includeDeleted) load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete category"))
    }
  }

  const handleRestore = async (category: ExpenseCategory) => {
    try {
      await dispatch(restoreExpenseCategory(category.id)).unwrap()
      toast.success("Category restored")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore category"))
    }
  }

  const columns: ColumnDef<ExpenseCategory>[] = [
    {
      accessorKey: "name",
      header: "NAME",
      cell: ({ row }) => (
        <div className="min-w-0 pr-3">
          <p className="text-sm font-semibold text-foreground">{row.original.name}</p>
          {row.original.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">{row.original.description}</p>
          )}
        </div>
      ),
    },
    {
      id: "account",
      header: "EXPENSE ACCOUNT",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{accountLabel(accountsById.get(row.original.expense_account_id))}</span>
      ),
    },
    {
      id: "status",
      header: "STATUS",
      cell: ({ row }) =>
        row.original.deleted_at ? (
          <StatusBadge status="deleted" tone="destructive" />
        ) : (
          <StatusBadge status={row.original.is_active ? "active" : "inactive"} />
        ),
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const cat = row.original
        if (!canPost) return null
        if (cat.deleted_at) return <RestoreButton label={cat.name} onClick={() => handleRestore(cat)} />
        return (
          <TableActions
            itemName={cat.name}
            onEdit={() => {
              setEditing(cat)
              setFormOpen(true)
            }}
            onDelete={() => handleDelete(cat)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <Button variant="back" size="sm" asChild>
            <Link to="/expenses">
              <ArrowLeft className="size-4" /> Expenses
            </Link>
          </Button>
          <PageHeading title="Expense Categories" description="Group spending and map it to the right expense account." />
        </div>
        {canPost && (
          <div className="flex flex-wrap items-center gap-3">
            <CsvImportButton
              entityName="expense categories"
              fields={importFields}
              createRow={(payload) => dispatch(postData({ payload: payload as Partial<ExpenseCategory> })).unwrap()}
              onComplete={() => {
                accountLookup.reset()
                load()
              }}
            />
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-5" /> New Category
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search categories..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={
          canPost
            ? [
                {
                  component: (
                    <ShowDeletedToggle
                      id="categories-deleted"
                      checked={includeDeleted}
                      onCheckedChange={(v) => {
                        setIncludeDeleted(v)
                        setPage(1)
                      }}
                    />
                  ),
                },
              ]
            : []
        }
      />

      <DataTable
        columns={columns}
        data={data}
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
        emptyIcon={Tags}
        emptyTitle="No expense categories"
        emptyDescription="Create categories so expenses can be grouped without picking ledger accounts."
        emptyActionLabel={canPost ? "New Category" : undefined}
        onEmptyAction={
          canPost
            ? () => {
                setEditing(null)
                setFormOpen(true)
              }
            : undefined
        }
        minWidth="760px"
        columnWidths={["320px", "220px", "110px", "110px"]}
      />

      <CategoryFormDialog open={formOpen} onOpenChange={setFormOpen} category={editing} accounts={accounts} />
    </div>
  )
}

export default ExpenseCategories
