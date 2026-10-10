import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { BookText, Plus } from "lucide-react"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { Combobox } from "@/components/common/ComboBox"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { FormDialog, SwitchField } from "@/components/common/FormDialog"
import { TextCell } from "@/components/common/cells"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"
import { SelectField, TextField } from "@/components/common/form-fields"
import { RestoreDeletedButton } from "@/components/common/RestoreDeletedButton"
import { reportFormError } from "@/lib/forms"
import { humanize } from "@/lib/format"
import type { Option } from "@/lib/types"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useCan } from "@/hooks/use-can"
import { useSoftDeleteList } from "@/hooks/use-soft-delete-list"

import { deleteData, fetchAll, patchData, postData, restoreAccount } from "../slices/accountSlice"
import type { Account, AccountPayload, AccountType } from "../types"
import { accountLabel, useAccounts } from "../hooks/useFinanceHelpers"
import { findAccount, useFinanceImportLookups } from "../hooks/useImportLookups"

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
      reportFormError(err, { setError, fields: Object.keys(schema.shape), fallback: "Failed to save account" })
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={account ? "Edit Account" : "New Ledger Account"}
      description="Accounts in the chart are what every journal line posts to."
      onSubmit={handleSubmit(onSubmit)}
      submitting={isSubmitting}
      submitLabel={account ? "Save Changes" : "Create Account"}
    >
      <div className="grid grid-cols-3 gap-4">
        <TextField label="Code *" id="acc-code" placeholder="e.g. 5300" error={errors.code} {...register("code")} />
        <TextField className="col-span-2" label="Name *" id="acc-name" error={errors.name} {...register("name")} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          control={control}
          name="type"
          label="Type *"
          id="acc-type"
          options={ACCOUNT_TYPES.map((t) => ({ label: humanize(t), value: t }))}
        />
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
      {account && <SwitchField control={control} name="is_active" label="Active" />}
    </FormDialog>
  )
}

const ChartOfAccounts = () => {
  useDocumentTitle("Chart of accounts")
  const dispatch = useAppDispatch()
  const listState = useAppSelector((state) => state.ledgerAccounts)
  const canPost = useCan("accounting.post")
  const { accounts: allAccounts, accountsById, reload: reloadLookup } = useAccounts()

  const [type, setType] = useState<Option | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)

  const openForm = (account: Account | null) => {
    setEditing(account)
    setFormOpen(true)
  }

  const { list, statusColumn, actionsColumn, bulk } = useSoftDeleteList<Account>({
    fetch: (params) => dispatch(fetchAll(params)),
    state: listState,
    params: { type: type?.value },
    pageSize: PAGE_SIZE,
    noun: "account",
    canUpdate: canPost,
    remove: (id) => dispatch(deleteData(id)).unwrap(),
    setActive: (id, is_active) => dispatch(patchData({ id, payload: { is_active } as Partial<Account> })).unwrap(),
    onEdit: openForm,
    itemName: (acc) => `${acc.code} ${acc.name}`,
    onDeleted: () => {
      toast.success("Account deleted")
      reloadLookup()
    },
  })

  const { accountLookup } = useFinanceImportLookups()
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
        <TextCell
          value={row.original.parent_id ? accountLabel(accountsById.get(row.original.parent_id)) : null}
          muted
        />
      ),
    },
    statusColumn,
    actionsColumn,
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Chart of accounts"
        actions={
          canPost && (
            <>
              <RestoreDeletedButton<Account>
                noun="accounts"
                endpoint="/admin/accounting/accounts/"
                restore={(item) => dispatch(restoreAccount(item.id)).unwrap()}
                label={(item) => item.name}
                sub={(item) => item.code}
                onRestored={() => {
      reloadLookup()
      list.reload()
    }}
              />
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
                  list.reload()
                }}
              />
              <Button size="action" onClick={() => openForm(null)}>
                <Plus className="size-5" /> New Account
              </Button>
            </>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search code or name..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={ACCOUNT_TYPES.map((t) => ({ label: humanize(t), value: t }))}
                placeholder="Type"
                value={type}
                onValueChange={setType}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          bulk && {
            ...bulk,
            onDone: () => {
              reloadLookup()
              list.reload()
            },
          }
        }
        data={listState.data}
        {...list.tableProps}
        emptyIcon={BookText}
        emptyTitle="No accounts found"
        minWidth="860px"
        columnWidths={["100px", "260px", "120px", "220px", "110px", "80px"]}
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
