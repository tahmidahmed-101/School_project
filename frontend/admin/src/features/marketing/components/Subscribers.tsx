import { useCallback, useEffect, useState, type FormEvent } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon, Loader2, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { deleteData, fetchAll, patchData, postData } from "@/features/marketing/slices/subscriberSlice"
import type { NewsletterSubscriber } from "@/features/marketing/types"
import { downloadCsv } from "@/features/system/files"
import { useCan } from "@/features/system/permissions"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { extractApiError, getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"
import { CsvImportButton, type ImportField } from "@/components/common/CsvImportDialog"

const PAGE_SIZE = 20

// Mirrors AdminNewsletterSubscriberWriteSerializer (POST /admin/marketing/subscribers/).
const SUBSCRIBER_IMPORT_FIELDS: ImportField[] = [
  { key: "email", label: "Email", required: true, example: "farhana.akter@example.com" },
  { key: "is_active", label: "Subscribed", type: "boolean", aliases: ["active", "status"], example: "yes" },
]

const statusOptions = [
  { label: "Subscribed", value: "true" },
  { label: "Unsubscribed", value: "false" },
]

const Subscribers = () => {
  useDocumentTitle("Subscribers")

  const dispatch = useAppDispatch()
  const canManage = useCan()("marketing.manage")
  const { data: subscribers, isFetchingList, isMutating, error, totalItems, meta } = useAppSelector(
    (state) => state.subscribers
  )

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [statusFilter, setStatusFilter] = useState<{ label: string; value: string } | null>(null)
  const [exporting, setExporting] = useState(false)

  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  const loadSubscribers = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(statusFilter ? { is_active: statusFilter.value } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, statusFilter]
  )

  useEffect(() => {
    const request = loadSubscribers()
    return () => request.abort()
  }, [loadSubscribers])

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
      const fields = extractApiError(err).fields
      setAddError(fields?.email?.[0] ?? getApiErrorMessage(err, "Couldn't add this subscriber"))
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv(
        "/admin/marketing/subscribers/export/",
        debouncedSearch ? { search: debouncedSearch } : {},
        "newsletter-subscribers.csv"
      )
    } catch (err) {
      toast.error(getApiErrorMessage(extractApiError(err), "Couldn't export subscribers"))
    } finally {
      setExporting(false)
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: "unsubscribed_at",
      header: "UNSUBSCRIBED",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.unsubscribed_at)}</span>
      ),
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
            header: "ACTION",
            cell: ({ row }) => (
              <TableActions itemName={row.original.email} onDelete={() => handleDelete(row.original)} />
            ),
          } satisfies ColumnDef<NewsletterSubscriber>,
        ]
      : []),
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Newsletter Subscribers" description="People who signed up for your newsletter." />
        <div className="flex items-center gap-3">
          <Button variant="primary" size="action" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} Export CSV
          </Button>
          {canManage && (
            <CsvImportButton
              entityName="subscribers"
              fields={SUBSCRIBER_IMPORT_FIELDS}
              createRow={(payload) => dispatch(postData({ payload: payload as Partial<NewsletterSubscriber> })).unwrap()}
              onComplete={() => void loadSubscribers()}
            />
          )}
          {canManage && (
            <Button variant="apply" size="action" onClick={() => setAddOpen(true)}>
              <PlusIcon className="size-5" /> Add Subscriber
            </Button>
          )}
        </div>
      </div>

      <FilterToolbar
        searchPlaceholder="Search by email..."
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={statusOptions}
                placeholder="Status"
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={subscribers}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadSubscribers}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        emptyTitle="No subscribers"
        emptyDescription="Newsletter sign-ups from the storefront will appear here."
        minWidth="760px"
      />

      <Dialog
        open={addOpen}
        onOpenChange={(open) => {
          setAddOpen(open)
          if (!open) setAddError(null)
        }}
      >
        <DialogContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add subscriber</DialogTitle>
              <DialogDescription>Only add people who have agreed to receive your newsletter.</DialogDescription>
            </DialogHeader>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isMutating || !newEmail.trim()}>
                {isMutating && <Loader2 className="size-4 animate-spin" />}
                Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Subscribers
