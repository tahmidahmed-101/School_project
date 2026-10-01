import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { BookText, CheckCircle2, Loader2, Plus } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { humanize } from "@/lib/format"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { deleteData, fetchAll, patchData, postData, restoreAccount } from "../slices/accountSlice"
import type { Account, AccountPayload, AccountType } from "../types"
import { accountLabel, useAccounts, useCan, useDebouncedValue } from "../hooks/useFinanceHelpers"
import { findAccount, useImportLookup } from "../hooks/useImportLookups"
import { RestoreButton, ShowDeletedToggle } from "./shared"

const PAGE_SIZE = 50
const NONE = "none"
const ACCOUNT_TYPES: AccountType[] = ["asset", "liability", "equity", "revenue", "expense"]
const TYPE_TONE: Record<AccountType, "info" | "warning" | "secondary" | "success" | "destructive"> = {
  asset: "info",
  liability: "warning",
  equity: "secondary",
  revenue: "success",
  expense: "destructive",
}

const schema = z.object({
  code: z.string().trim().min(1, "Code is required"),
  name: z.string().trim().min(1, "Name is required"),
  type: z.enum(["asset", "liability", "equity", "revenue", "expense"]),
  parent_id: z.string(),
  is_active: z.boolean(),
})
type FormValues = z.infer<typeof schema>

function AccountFormDialog({
  open,
  onOpenChange,
  account,
  allAccounts,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  account: Account | null
  allAccounts: Account[]
  onSaved: () => void
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
        code: account?.code ?? "",
        name: account?.name ?? "",
        type: account?.type ?? "expense",
        parent_id: account?.parent_id ?? NONE,
        is_active: account?.is_active ?? true,
      })
    }
  }, [open, account, reset])

  const onSubmit = async (values: FormValues) => {
    const payload: AccountPayload = {
      code: values.code.trim(),
      name: values.name.trim(),
      type: values.type,
      parent_id: values.parent_id === NONE ? null : values.parent_id,
      ...(account ? { is_active: values.is_active } : {}),
    }
    try {
      if (account) {
        await dispatch(patchData({ id: account.id, payload: payload as Partial<Account> })).unwrap()
        toast.success("Account updated")
      } else {
        await dispatch(postData({ payload: payload as Partial<Account> })).unwrap()
        toast.success("Account created")
      }
      onSaved()
      onOpenChange(false)
    } catch (err) {
      for (const [field, message] of Object.entries(getApiFieldErrors(err))) {
        if (field in schema.shape) setError(field as keyof FormValues, { message })
      }
      toast.error(getApiErrorMessage(err, "Failed to save account"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? "Edit Account" : "New Ledger Account"}</DialogTitle>
          <DialogDescription>Accounts in the chart are what every journal line posts to.</DialogDescription>
        </DialogHeader>
        <form id="account-form" onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-4">
            <Field>
              <FieldLabel htmlFor="acc-code">Code *</FieldLabel>
              <FieldContent>
                <Input id="acc-code" placeholder="e.g. 5300" aria-invalid={!!errors.code} {...register("code")} />
                <FieldError errors={[errors.code]} />
              </FieldContent>
            </Field>
            <Field className="col-span-2">
              <FieldLabel htmlFor="acc-name">Name *</FieldLabel>
              <FieldContent>
                <Input id="acc-name" aria-invalid={!!errors.name} {...register("name")} />
                <FieldError errors={[errors.name]} />
              </FieldContent>
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="acc-type">Type *</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="acc-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {humanize(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.type]} />
              </FieldContent>
            </Field>
            <Field>
              <FieldLabel htmlFor="acc-parent">Parent account</FieldLabel>
              <FieldContent>
                <Controller
                  control={control}
                  name="parent_id"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="acc-parent">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>None (top level)</SelectItem>
                        {allAccounts
                          .filter((a) => a.id !== account?.id)
                          .map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {accountLabel(a)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.parent_id]} />
              </FieldContent>
            </Field>
          </div>
          {account && (
            <Controller
              control={control}
              name="is_active"
              render={({ field }) => (
                <div className="flex items-center gap-3">
                  <Switch id="acc-active" checked={field.value} onCheckedChange={field.onChange} />
                  <label htmlFor="acc-active" className="text-sm">
                    Active
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
          <Button type="submit" form="account-form" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
            {account ? "Save Changes" : "Create Account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type Option = { label: string; value: string }

const ChartOfAccounts = () => {
  useDocumentTitle("Chart of Accounts")
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.ledgerAccounts)
  const canPost = useCan("accounting.post")
  const { accounts: allAccounts, accountsById, reload: reloadLookup } = useAccounts()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [type, setType] = useState<Option | null>(null)
  const [includeDeleted, setIncludeDeleted] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(type ? { type: type.value } : {}),
          ...(includeDeleted ? { include_deleted: "true" } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, type, includeDeleted]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const accountLookup = useImportLookup<Account>("/admin/accounting/accounts/")
  const importFields = useMemo<ImportField[]>(
    () => [
      { key: "code", label: "Code", required: true, aliases: ["Account code"], example: "6500" },
      { key: "name", label: "Name", required: true, aliases: ["Account name"], example: "Courier & Delivery Expense" },
      { key: "type", label: "Type", required: true, type: "enum", options: ACCOUNT_TYPES, aliases: ["Account type"], example: "expense" },
      {
        key: "parent_id",
        label: "Parent account",
        aliases: ["Parent", "Parent code"],
        example: "6900",
        resolve: async (raw) => findAccount(raw, await accountLookup.get(), { what: "Parent account" }),
      },
    ],
    [accountLookup]
  )

  const handleDelete = async (account: Account) => {
    try {
      await dispatch(deleteData(account.id)).unwrap()
      toast.success("Account deleted")
      reloadLookup()
      if (includeDeleted) load()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to delete account"))
    }
  }

  const handleRestore = async (account: Account) => {
    try {
      await dispatch(restoreAccount(account.id)).unwrap()
      toast.success("Account restored")
      reloadLookup()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to restore account"))
    }
  }

  const columns: ColumnDef<Account>[] = [
    {
      accessorKey: "code",
      header: "CODE",
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: "NAME",
      cell: ({ row }) => <span className="text-sm font-medium text-foreground">{row.original.name}</span>,
    },
    {
      accessorKey: "type",
      header: "TYPE",
      cell: ({ row }) => <StatusBadge status={row.original.type} tone={TYPE_TONE[row.original.type]} />,
    },
    {
      id: "parent",
      header: "PARENT",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.parent_id ? accountLabel(accountsById.get(row.original.parent_id)) : "—"}
        </span>
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
        const acc = row.original
        if (!canPost) return null
        if (acc.deleted_at) return <RestoreButton label={acc.name} onClick={() => handleRestore(acc)} />
        return (
          <TableActions
            itemName={`${acc.code} ${acc.name}`}
            onEdit={() => {
              setEditing(acc)
              setFormOpen(true)
            }}
            onDelete={() => handleDelete(acc)}
          />
        )
      },
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Chart of Accounts" description="The ledger accounts every posting is booked against." />
        {canPost && (
          <div className="flex flex-wrap items-center gap-3">
            <CsvImportButton
              entityName="accounts"
              fields={importFields}
              createRow={async (payload) => {
                const created = await dispatch(postData({ payload: payload as Partial<Account> })).unwrap()
                // Lets later rows in the same file use this account as their parent.
                accountLookup.add(created)
                return created
              }}
              onComplete={() => {
                accountLookup.reset()
                reloadLookup()
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
              <Plus className="size-5" /> New Account
            </Button>
          </div>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search code or name..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={ACCOUNT_TYPES.map((t) => ({ label: humanize(t), value: t }))}
                placeholder="Type"
                value={type}
                onValueChange={(v) => {
                  setType(v)
                  setPage(1)
                }}
              />
            ),
          },
          ...(canPost
            ? [
                {
                  component: (
                    <ShowDeletedToggle
                      id="accounts-deleted"
                      checked={includeDeleted}
                      onCheckedChange={(v) => {
                        setIncludeDeleted(v)
                        setPage(1)
                      }}
                    />
                  ),
                },
              ]
            : []),
        ]}
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
        emptyIcon={BookText}
        emptyTitle="No accounts found"
        minWidth="860px"
        columnWidths={["100px", "260px", "120px", "220px", "110px", "110px"]}
      />

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        allAccounts={allAccounts}
        onSaved={reloadLookup}
      />
    </div>
  )
}

export default ChartOfAccounts
