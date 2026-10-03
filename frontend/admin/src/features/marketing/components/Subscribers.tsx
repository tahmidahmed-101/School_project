import { useState, type FormEvent } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { ExportButton } from "@/components/common/ExportButton"
import { FormDialog } from "@/components/common/FormDialog"
import { DateCell } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, patchData, postData } from "@/features/marketing/slices/subscriberSlice"
import type { NewsletterSubscriber } from "@/features/marketing/types"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { extractApiError, getApiErrorMessage, getApiFieldErrors } from "@/lib/api/client"
import { downloadFile } from "@/lib/download"
import type { Option } from "@/lib/types"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

// Mirrors AdminNewsletterSubscriberWriteSerializer (POST /admin/marketing/subscribers/).
const SUBSCRIBER_IMPORT_FIELDS: ImportField[] = [
  { key: "email", label: "Email", required: true, example: "farhana.akter@example.com" },
  { key: "is_active", label: "Subscribed", type: "boolean", aliases: ["active", "status"], example: "yes" },
]

const statusOptions: Option[] = [
  { label: "Subscribed", value: "true" },
  { label: "Unsubscribed", value: "false" },
]

const Subscribers = () => {
  useDocumentTitle("Subscribers")

  const dispatch = useAppDispatch()
  const canManage = useCan("marketing.manage")
  const subscriberState = useAppSelector((state) => state.subscribers)
  const { data: subscribers, isMutating } = subscriberState

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)

  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: subscriberState,
    params: { is_active: statusFilter?.value },
  })

  const handleToggle = async (subscriber: NewsletterSubscriber, isActive: boolean) => {
    try {
      await dispatch(patchData({ id: subscriber.id, payload: { is_active: isActive } })).unwrap()
      toast.success(isActive ? `${subscriber.email} resubscribed` : `${subscriber.email} unsubscribed`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't update this subscriber"))
    }
  }

  const handleDelete = async (subscriber: NewsletterSubscriber) => {
    try {
      await dispatch(deleteData(subscriber.id)).unwrap()
      toast.success(`${subscriber.email} removed`)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't remove this subscriber"))
    }
  }

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault()
    setAddError(null)
    try {
      await dispatch(postData({ payload: { email: newEmail.trim() } })).unwrap()
      toast.success(`${newEmail.trim()} subscribed`)
      setAddOpen(false)
      setNewEmail("")
    } catch (err) {
      setAddError(getApiFieldErrors(err).email ?? getApiErrorMessage(err, "Couldn't add this subscriber"))
    }
  }

  const handleExport = async () => {
    try {
      await downloadFile("/admin/marketing/subscribers/export/", "newsletter-subscribers.csv", list.query)
    } catch (err) {
      throw extractApiError(err)
    }
  }

  const columns: ColumnDef<NewsletterSubscriber>[] = [
    {
      accessorKey: "email",
      header: "EMAIL",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.email}</span>,
    },
    {
      accessorKey: "created_at",
      header: "SUBSCRIBED",
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "unsubscribed_at",
      header: "UNSUBSCRIBED",
      cell: ({ row }) => <DateCell withTime value={row.original.unsubscribed_at} className="text-muted-foreground" />,
    },
    {
      accessorKey: "is_active",
      header: "STATUS",
      cell: ({ row }) =>
        canManage ? (
          <div className="flex items-center gap-2" data-no-row-click="true">
            <Switch
              checked={row.original.is_active}
              disabled={isMutating}
              onCheckedChange={(checked) => handleToggle(row.original, checked)}
              aria-label={`${row.original.is_active ? "Unsubscribe" : "Resubscribe"} ${row.original.email}`}
            />
            <span className="text-sm text-muted-foreground">{row.original.is_active ? "Subscribed" : "Unsubscribed"}</span>
          </div>
        ) : (
          <StatusBadge
            status={row.original.is_active ? "active" : "inactive"}
            label={row.original.is_active ? "Subscribed" : "Unsubscribed"}
          />
        ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "ACTIONS",
            cell: ({ row }) => (
              <TableActions itemName={row.original.email} onDelete={() => handleDelete(row.original)} />
            ),
          } satisfies ColumnDef<NewsletterSubscriber>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Newsletter Subscribers"
        actions={
          <>
            <ExportButton onExport={handleExport} />
            {canManage && (
              <CsvImportButton
                entityName="subscribers"
                fields={SUBSCRIBER_IMPORT_FIELDS}
                createRow={(payload) => dispatch(postData({ payload: payload as Partial<NewsletterSubscriber> })).unwrap()}
                onComplete={list.reload}
              />
            )}
            {canManage && (
              <Button variant="apply" size="action" onClick={() => setAddOpen(true)}>
                <PlusIcon className="size-5" /> Add Subscriber
              </Button>
            )}
          </>
        }
      />

      <FilterToolbar
        searchPlaceholder="Search by email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={statusOptions}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        bulk={
          canManage
            ? { noun: "subscriber", deleteRow: (r) => dispatch(deleteData(r.id)).unwrap(), onDone: list.reload }
            : undefined
        }
        data={subscribers}
        {...list.tableProps}
        emptyTitle="No subscribers"
        emptyDescription="Newsletter sign-ups from the storefront will appear here."
        minWidth="760px"
      />

      <FormDialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) setAddError(null)
        }}
        title="Add subscriber"
        description="Only add people who have agreed to receive your newsletter."
        onSubmit={handleAdd}
        submitting={isMutating}
        submitLabel="Add"
        submitDisabled={!newEmail.trim()}
      >
        <div className="space-y-2">
          <Label htmlFor="subscriber-email">Email</Label>
          <Input
            id="subscriber-email"
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          {addError && (
            <p role="alert" className="text-sm text-destructive">
              {addError}
            </p>
          )}
        </div>
      </FormDialog>
    </div>
  )
}

export default Subscribers
