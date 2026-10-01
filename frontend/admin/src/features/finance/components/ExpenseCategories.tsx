import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, Tags } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { DeletedToggle } from "@/components/common/DeletedToggle"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { ActiveStatusBadge } from "@/components/common/cells"
import { getApiErrorMessage } from "@/lib/api/client"
import { reportFormError } from "@/lib/forms"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useListPage } from "@/hooks/use-list-page"

import { deleteData, fetchAll, patchData, postData, restoreExpenseCategory } from "../slices/expenseCategorySlice"
import type { Account, ExpenseCategory, ExpenseCategoryPayload } from "../types"
import { accountLabel, useAccounts } from "../hooks/useFinanceHelpers"

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
      reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to save category" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={category ? "Edit Category" : "New Expense Category"}
      description="Each category maps to an expense account; leave it blank to use the general expense account."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={category ? "Save Changes" : "Create Category"}
    >
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
        <SwitchField control={control} name="is_active" label="Active (available when recording expenses)" />
      )}
    </FormDialog>
  )
}

const ExpenseCategories = () => {
  useDocumentTitle("Expense Categories")
  const dispatch = useAppDispatch()
  const listState = useAppSelector((state) => state.expenseCategories)
  const canPost = useCan("accounting.post")
  const { accounts, accountsById } = useAccounts()

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseCategory | null>(null)

  const list = useListPage({ fetch: (params) => dispatch(fetchAll(params)), state: listState })

  const handleDelete = async (category: ExpenseCategory) => {
    try {
      await dispatch(deleteData(category.id)).unwrap()
      toast.success("Category deleted")
      if (list.includeDeleted) list.reload()
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
      cell: ({ row }) => <ActiveStatusBadge deleted={row.original.deleted_at} active={row.original.is_active} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => {
        const cat = row.original
        if (!canPost) return null
        return (
          <TableActions
            itemName={cat.name}
            deleted={!!cat.deleted_at}
            onRestore={() => handleRestore(cat)}
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
      <PageHeader
        title="Expense Categories"
        description="Group spending and map it to the right expense account."
        back={{ to: "/expenses", label: "Expenses" }}
        actions={
          canPost && (
            <Button
              size="action"
              onClick={() => {
                setEditing(null)
                setFormOpen(true)
              }}
            >
              <Plus className="size-5" /> New Category
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search categories..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={
          canPost
            ? [{ component: <DeletedToggle pressed={list.includeDeleted} onPressedChange={list.setIncludeDeleted} /> }]
            : []
        }
      />

      <DataTable
        columns={columns}
        data={listState.data}
        {...list.tableProps}
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
