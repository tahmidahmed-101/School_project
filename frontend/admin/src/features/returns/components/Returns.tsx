import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate } from "react-router-dom"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { Combobox } from "@/components/common/ComboBox"
import { LinkCell, TextCell } from "@/components/common/cells"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllReturns } from "@/features/returns/slices/returnSlice"
import { RMA_STATUS_OPTIONS, type Rma } from "@/features/returns/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import type { Option } from "@/lib/types"

const ReturnsList = () => {
  const kind = useKind()
  const isPreorder = kind === "preorder"
  const title = isPreorder ? "Pre-order returns" : "Returns"
  useDocumentTitle(title)

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const returnsState = useAppSelector((state) => state.returns)

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)

  const list = useListPage({
    fetch: (p) => dispatch(fetchAllReturns(p)),
    state: returnsState,
    params: { kind, status: statusFilter?.value },
  })

  const columns: ColumnDef<Rma>[] = [
    {
      accessorKey: "rma_number",
      header: "RMA #",
      cell: ({ row }) => <span className="text-sm font-medium text-primary">{row.original.rma_number}</span>,
    },
    {
      id: "order",
      header: isPreorder ? "PRE-ORDER" : "ORDER",
      cell: ({ row }) => (
        <LinkCell to={`/order_detail/${row.original.order_id}`}>{isPreorder ? "View pre-order" : "View order"}</LinkCell>
      ),
    },
    {
      id: "units",
      header: "UNITS",
      cell: ({ row }) => (
        <span className="text-sm">
          {row.original.lines.reduce((n, l) => n + l.quantity, 0)} in {row.original.lines.length} line(s)
        </span>
      ),
    },
    {
      accessorKey: "reason",
      header: "REASON",
      cell: ({ row }) => <TextCell value={row.original.reason} muted className="line-clamp-2" />,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions itemName={`Return ${row.original.rma_number}`} viewUrl={`/return_detail/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title={title} />

      <FilterToolbar
        searchPlaceholder="Search RMA number..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={[
          {
            component: (
              <Combobox
                options={RMA_STATUS_OPTIONS}
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
        data={returnsState.data.filter((row) => (row.order_type ?? kind) === kind)}
        {...list.tableProps}
        onRowClick={(rma) => navigate(`/return_detail/${rma.id}`)}
        emptyTitle="No returns found"
        emptyDescription={
          isPreorder
            ? "Returns are opened from a pre-order's page or by customers."
            : "Returns are opened from an order's detail page or by customers."
        }
        minWidth="900px"
        columnWidths={["150px", "120px", "150px", "280px", "120px", "80px"]}
      />
    </div>
  )
}

// Both halves render this component on different routes; the key gives each half its own filters and page.
const ReturnsPage = () => <ReturnsList key={useKind()} />

export default ReturnsPage
