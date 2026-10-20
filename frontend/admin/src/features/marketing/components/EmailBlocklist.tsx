import { useState, type FormEvent } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { FormDialog } from "@/components/common/FormDialog"
import { DateCell } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { TextField } from "@/components/common/form-fields"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, postData } from "@/features/marketing/slices/suppressionSlice"
import type { EmailSuppression } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import type { Option } from "@/lib/types"
import { SUPPRESSION_REASON_LABEL, SUPPRESSION_REASON_TONE } from "../lib/campaigns"

const reasonOptions: Option[] = Object.entries(SUPPRESSION_REASON_LABEL).map(([value, label]) => ({ label, value }))

const EmailBlocklist = () => {
  useDocumentTitle("Blocked emails")

  const dispatch = useAppDispatch()
  const canManage = useCan("marketing.manage")
  const suppressionState = useAppSelector((state) => state.emailSuppressions)
  const { data: suppressions, isMutating } = suppressionState

  const [reasonFilter, setReasonFilter] = useState<Option | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [note, setNote] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: suppressionState,
    params: { reason: reasonFilter?.value },
  })

  const handleUnblock = async (suppression: EmailSuppression) => {
    try {
      await dispatch(deleteData(suppression.id)).unwrap()
      toast.success(`${suppression.email} unblocked`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't unblock this address"))
    }
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setAddError(null)
    try {
      await dispatch(postData({ payload: { email: email.trim(), note: note.trim() } })).unwrap()
      toast.success(`${email.trim()} blocked`)
      setAddOpen(false)
      setEmail("")
      setNote("")
    } catch (err) {
      setAddError(getApiFieldErrors(err).email ?? getApiErrorMessage(err, "Couldn't block this address"))
    }
  }

  const columns: ColumnDef<EmailSuppression>[] = [
    {
      accessorKey: "email",
      header: "EMAIL",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{row.original.email}</p>
          {row.original.note && <p className="truncate text-xs text-muted-foreground">{row.original.note}</p>}
        </div>
      ),
    },
    {
      accessorKey: "reason",
      header: "REASON",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.reason}
          tone={SUPPRESSION_REASON_TONE[row.original.reason]}
          label={SUPPRESSION_REASON_LABEL[row.original.reason]}
          className="normal-case"
        />
      ),
    },
    {
      accessorKey: "created_at",
      header: "BLOCKED",
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions
                itemName={row.original.email}
                deleteDescription="Removing it from the list lets campaigns reach this address again."
                onDelete={() => handleUnblock(row.original)}
              />
            ),
          } satisfies ColumnDef<EmailSuppression>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Blocked emails"
        description="No campaign is sent to these addresses. Password resets and other account emails still go out."
        actions={
          canManage && (
            <Button variant="apply" size="action" onClick={() => setAddOpen(true)}>
              <PlusIcon className="size-5" /> Block Email
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox options={reasonOptions} placeholder="Reason" value={reasonFilter} onValueChange={setReasonFilter} />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "blocked email", deleteRow: (r) => dispatch(deleteData(r.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={suppressions}
        {...list.tableProps}
        emptyTitle="No blocked emails"
        emptyDescription="Addresses that unsubscribe, or that the mail server refuses, are added here automatically."
        minWidth="720px"
      />

      <FormDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) setAddError(null)
        }}
        title="Block an email"
        description="Campaigns will skip this address, even if it is subscribed."
        onSubmit={handleAdd}
        submitting={isMutating}
        submitLabel="Block"
        submitDisabled={!email.trim()}
      >
        <TextField
          label="Email"
          id="suppression-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={addError ? { message: addError } : undefined}
        />
        <TextField
          label="Note"
          id="suppression-note"
          maxLength={255}
          placeholder="Optional, for your team"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormDialog>
    </div>
  )
}

export default EmailBlocklist
