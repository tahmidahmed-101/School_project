import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import { PageHeading } from "@/components/common/PageHeading"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/risk/slices/fraudCaseSlice"
import { selectFraudCases } from "@/features/risk/selectors"
import type { FraudCase } from "@/features/risk/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatDateTime, humanize } from "@/lib/format"
import { fraudStatusTone } from "./fraudStatus"

const PAGE_SIZE = 20

const statusOptions = [
  { label: "New", value: "new" },
  { label: "Under review", value: "under_review" },
  { label: "Resolved", value: "resolved" },
]

const ORDERING_OPTIONS = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "status", label: "By status" },
]

const FraudCases = () => {
  useDocumentTitle("Fraud Cases")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: cases, isFetchingList, error, totalItems, meta } = useAppSelector(selectFraudCases)

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<{ label: string; value: string } | null>(null)
  const [ordering, setOrdering] = useState("-created_at")

  const loadCases = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ordering,
          ...(statusFilter ? { status: statusFilter.value } : {}),
        })
      ),
    [dispatch, page, ordering, statusFilter]
  )

  useEffect(() => {
    const request = loadCases()
    return () => request.abort()
  }, [loadCases])

  const columns: ColumnDef<FraudCase>[] = [
    {
      accessorKey: "case_number",
      header: "CASE",
      cell: ({ row }) => <span className="font-mono text-sm font-medium text-primary">{row.original.case_number}</span>,
    },
    {
      accessorKey: "description",
      header: "DESCRIPTION",
      cell: ({ row }) => <span className="line-clamp-2 text-sm">{row.original.description}</span>,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} tone={fraudStatusTone[row.original.status]} label={humanize(row.original.status)} />
      ),
    },
    {
      accessorKey: "created_at",
      header: "OPENED",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDateTime(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => <TableActions itemName={row.original.case_number} viewUrl={`/fraud_cases/${row.original.id}`} />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeading title="Fraud Cases" description="Orders and customers flagged for review by risk rules." />

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 pt-4">
        <div className="w-full sm:w-[220px]">
          <ExampleComboboxCustomItems
            frameworks={statusOptions}
            placeholder="Status"
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value)
              setPage(1)
            }}
          />
        </div>
        <Select
          value={ordering}
          onValueChange={(value) => {
            setOrdering(value)
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]" aria-label="Sort cases">
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
      </div>

      <DataTable
        columns={columns}
        data={cases}
        pageSize={PAGE_SIZE}
        isLoading={isFetchingList}
        error={error}
        onRetry={loadCases}
        manualPagination
        pageIndex={page - 1}
        pageCount={meta?.totalPages ?? 1}
        totalCount={totalItems}
        onPageChange={(index) => setPage(index + 1)}
        onRowClick={(c) => navigate(`/fraud_cases/${c.id}`)}
        emptyTitle="No fraud cases"
        emptyDescription="Nothing has been flagged. Cases appear here when risk rules raise one."
        minWidth="820px"
        columnWidths={["150px", "360px", "130px", "180px", "90px"]}
      />
    </div>
  )
}

export default FraudCases
