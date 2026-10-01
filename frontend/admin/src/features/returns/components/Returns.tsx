import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useNavigate } from "react-router-dom"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { TableActions } from "@/components/common/TableActions"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllReturns } from "@/features/returns/slices/returnSlice"
import { RMA_STATUS_OPTIONS, type Rma } from "@/features/returns/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"

const PAGE_SIZE = 20

type Option = { label: string; value: string }

const Returns = () => {
  useDocumentTitle("Returns")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: returns, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.returns)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Option | null>(null)

  useEffect(() => {
    const next = search.trim()
    if (next === debouncedSearch) return
    const t = setTimeout(() => {
      setDebouncedSearch(next)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search, debouncedSearch])

  const status = statusFilter?.value
  const load = useCallback(
    () =>
      dispatch(
        fetchAllReturns({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(status ? { status } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, status]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<Rma>[] = [
    {
      accessorKey: "rma_number",
      header: "RMA #",
      cell: ({ row }) => <span className="text-sm font-medium text-primary">{row.original.rma_number}</span>,
    },
    {
      id: "order",
      header: "ORDER",
      cell: ({ row }) => (
        <Link
          to={`/order_detail/${row.original.order_id}`}
          className="text-sm text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
          data-no-row-click="true"
        >
          View order
        </Link>
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
      cell: ({ row }) => (
        <span className="line-clamp-2 text-sm text-muted-foreground">{row.original.reason || "—"}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions itemName={`Return ${row.original.rma_number}`} viewUrl={`/return_detail/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeading title="Returns" description="Review return requests, grade returned items and book receipts." />

      <FilterToolbar
        searchPlaceholder="Search RMA number..."
        searchValue={search}
        onSearchChange={setSearch}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={RMA_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={returns}
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
        onRowClick={(rma) => navigate(`/return_detail/${rma.id}`)}
        emptyTitle="No returns found"
        emptyDescription="Returns are opened from an order's detail page or by customers."
        minWidth="900px"
        columnWidths={["150px", "120px", "150px", "280px", "120px", "90px"]}
      />
    </div>
  )
}

export default Returns
