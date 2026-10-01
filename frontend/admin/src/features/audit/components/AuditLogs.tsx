import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import { DownloadIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/audit/slices/auditLogSlice"
import type { AuditLog } from "@/features/audit/types"
import { downloadCsv } from "@/features/system/files"
import { useDebounced } from "@/features/system/useDebounced"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatDateTime } from "@/lib/format"

const PAGE_SIZE = 25

const ORDERING_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "action", label: "Action A–Z" },
  { value: "-action", label: "Action Z–A" },
]

const AuditLogs = () => {
  useDocumentTitle("Audit Logs")

  const dispatch = useAppDispatch()
  const { data: logs, totalItems, meta, isFetchingList, error } = useAppSelector((state) => state.auditLogs)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounced(search.trim())
  const [ordering, setOrdering] = useState("-created_at")
  const [exporting, setExporting] = useState(false)
  const [viewing, setViewing] = useState<AuditLog | null>(null)

  const query = { ordering, ...(debouncedSearch ? { search: debouncedSearch } : {}) }

  const loadLogs = useCallback(
    () =>
      dispatch(
        fetchAll({ page, page_size: PAGE_SIZE, ordering, ...(debouncedSearch ? { search: debouncedSearch } : {}) })
      ),
    [dispatch, page, ordering, debouncedSearch]
  )

  useEffect(() => {
    const request = loadLogs()
    return () => request.abort()
  }, [loadLogs])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadCsv("/admin/audit/export/", query, "audit-logs.csv")
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't export the audit log"))
    } finally {
      setExporting(false)
    }
  }

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      accessorKey: "actor",
      header: "ACTOR",
      cell: ({ row }) => <span className="text-sm">{row.original.actor ?? <span className="text-muted-foreground">System</span>}</span>,
    },
    {
      accessorKey: "action",
      header: "ACTION",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.action}</span>,
    },
    {
      id: "target",
      header: "TARGET",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="text-sm">{row.original.target_type || "—"}</span>
          {row.original.target_id && (
            <span className="max-w-[220px] truncate font-mono text-xs text-muted-foreground" title={row.original.target_id}>
              {row.original.target_id}
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "ip_address",
      header: "IP ADDRESS",
      cell: ({ row }) => <span className="font-mono text-sm text-muted-foreground">{row.original.ip_address || "—"}</span>,
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Audit Logs" description="Every administrative change, who made it and when." />
        <Button variant="primary" size="action" onClick={handleExport} disabled={exporting}>
          {exporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} Export CSV
        </Button>
      </div>

      <FilterToolbar
        searchPlaceholder="Search action, target type or actor email..."
        searchValue={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <Select
                value={ordering}
                onValueChange={(value) => {
                  setOrdering(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[180px]" aria-label="Sort audit logs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDERING_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={logs}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadLogs}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={setViewing}
        emptyTitle="No audit entries"
        emptyDescription="No logged actions match this search."
        minWidth="1000px"
        columnWidths={["190px", "240px", "260px", "240px", "150px"]}
      />

      <Dialog open={!!viewing} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{viewing?.action}</DialogTitle>
            <DialogDescription>
              {viewing?.actor ?? "System"} · {formatDateTime(viewing?.created_at)}
              {viewing?.ip_address ? ` · ${viewing.ip_address}` : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Target</dt>
            <dd>{viewing?.target_type || "—"}</dd>
            <dt className="text-muted-foreground">Target ID</dt>
            <dd className="break-all font-mono text-xs">{viewing?.target_id || "—"}</dd>
          </dl>
          <div>
            <p className="mb-2 text-sm font-medium">Details</p>
            <pre className="max-h-[50vh] overflow-auto rounded-lg bg-muted p-3 text-xs">
              {JSON.stringify(viewing?.metadata ?? {}, null, 2)}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AuditLogs
