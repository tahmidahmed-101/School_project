import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { ExportButton } from "@/components/common/ExportButton"
import { SortSelect } from "@/components/common/SortSelect"
import { DetailRow } from "@/components/common/DetailRow"
import { DateCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/audit/slices/auditLogSlice"
import type { AuditLog } from "@/features/audit/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { extractApiError } from "@/lib/api/client"
import { downloadFile } from "@/lib/download"
import { formatDateTime } from "@/lib/format"
import type { Option } from "@/lib/types"

const PAGE_SIZE = 25

const ORDERING_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "action", label: "Action A–Z" },
  { value: "-action", label: "Action Z–A" },
]

const AuditLogs = () => {
  useDocumentTitle("Audit Logs")

  const dispatch = useAppDispatch()
  const logState = useAppSelector((state) => state.auditLogs)
  const logs = logState.data

  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])
  const [viewing, setViewing] = useState<AuditLog | null>(null)

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: logState,
    params: { ordering: ordering?.value ?? ORDERING_OPTIONS[0].value },
    pageSize: PAGE_SIZE,
  })

  const handleExport = async () => {
    try {
      await downloadFile("/admin/audit/export/", "audit-logs.csv", list.query)
    } catch (err) {
      throw extractApiError(err)
    }
  }

  const columns: ColumnDef<AuditLog>[] = [
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
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
      cell: ({ row }) => <TextCell muted value={row.original.ip_address} className="font-mono" />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Audit Logs"
        description="Every administrative change, who made it and when."
        actions={<ExportButton onExport={handleExport} />}
      />

      <FilterToolbar
        searchPlaceholder="Search action, target type or actor email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[{ component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> }]}
      />

      <DataTable
        columns={columns}
        data={logs}
        {...list.tableProps}
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
          <div>
            <DetailRow label="Target">{viewing?.target_type || "—"}</DetailRow>
            <DetailRow label="Target ID">
              <span className="break-all font-mono text-xs">{viewing?.target_id || "—"}</span>
            </DetailRow>
          </div>
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
