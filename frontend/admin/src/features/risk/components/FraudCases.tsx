import { useState } from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { DateCell } from "@/components/common/cells"
import { StatusBadge } from "@/components/common/StatusBadge"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/risk/slices/fraudCaseSlice"
import { selectFraudCases } from "@/features/risk/selectors"
import type { FraudCase } from "@/features/risk/types"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { humanize } from "@/lib/format"
import type { Option } from "@/lib/types"
import { fraudStatusTone } from "./fraudStatus"

const statusOptions: Option[] = [
  { label: "New", value: "new" },
  { label: "Under review", value: "under_review" },
  { label: "Resolved", value: "resolved" },
]

const ORDERING_OPTIONS: Option[] = [
  { value: "-created_at", label: "Newest first" },
  { value: "created_at", label: "Oldest first" },
  { value: "status", label: "By status" },
]

const FraudCases = () => {
  useDocumentTitle("Fraud Cases")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const caseState = useAppSelector(selectFraudCases)
  const cases = caseState.data

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  const list = useListPage({
    fetch: (params) => dispatch(fetchAll(params)),
    state: caseState,
    params: { ordering: ordering?.value ?? ORDERING_OPTIONS[0].value, status: statusFilter?.value },
  })

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
      cell: ({ row }) => <DateCell withTime value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => <TableActions itemName={row.original.case_number} viewUrl={`/fraud_cases/${row.original.id}`} />,
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title="Fraud Cases" />

      <FilterToolbar
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
          { component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} /> },
        ]}
      />

      <DataTable
        columns={columns}
        data={cases}
        {...list.tableProps}
        onRowClick={(c) => navigate(`/fraud_cases/${c.id}`)}
        emptyTitle="No fraud cases"
        emptyDescription="Nothing has been flagged. Cases appear here when risk rules raise one."
        minWidth="820px"
        columnWidths={["150px", "360px", "130px", "180px", "80px"]}
      />
    </div>
  )
}

export default FraudCases
