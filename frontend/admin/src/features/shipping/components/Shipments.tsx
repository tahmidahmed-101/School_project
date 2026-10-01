import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Link, useNavigate } from "react-router-dom"

import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { PageHeading } from "@/components/common/PageHeading"
import { TableActions } from "@/components/common/TableActions"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllShipments } from "@/features/shipping/slices/shipmentSlice"
import type { Shipment } from "@/features/shipping/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatCurrency, formatDateTime } from "@/lib/format"
import { ShipmentActions } from "./ShipmentActions"

const PAGE_SIZE = 20

const Shipments = () => {
  useDocumentTitle("Shipments")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: shipments, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.shipments)

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")

  useEffect(() => {
    const next = search.trim()
    if (next === debouncedSearch) return
    const t = setTimeout(() => {
      setDebouncedSearch(next)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search, debouncedSearch])

  const load = useCallback(
    () =>
      dispatch(
        fetchAllShipments({ page, page_size: PAGE_SIZE, ...(debouncedSearch ? { search: debouncedSearch } : {}) })
      ),
    [dispatch, page, debouncedSearch]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<Shipment>[] = [
    {
      accessorKey: "tracking_number",
      header: "TRACKING #",
      cell: ({ row }) => (
        <span className="font-mono text-sm font-medium text-primary">{row.original.tracking_number || "—"}</span>
      ),
    },
    {
      accessorKey: "carrier_name",
      header: "CARRIER",
      cell: ({ row }) => <span className="text-sm">{row.original.carrier_name || "Not set"}</span>,
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
      accessorKey: "cod_amount",
      header: "COD",
      cell: ({ row }) => <span className="text-sm">{formatCurrency(row.original.cod_amount)}</span>,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={row.original.status} />
          {row.original.courier_status && (
            <span className="text-xs text-muted-foreground">{row.original.courier_status}</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "shipped_at",
      header: "SHIPPED",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">{formatDateTime(row.original.shipped_at)}</span>
      ),
    },
    {
      id: "update",
      header: "UPDATE",
      cell: ({ row }) => <ShipmentActions shipment={row.original} />,
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions
          itemName={`Shipment ${row.original.tracking_number || ""}`.trim()}
          viewUrl={`/shipment_detail/${row.original.id}`}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeading title="Shipments" description="Track consignments, dispatch to couriers and update delivery status." />

      <FilterToolbar
        searchPlaceholder="Search tracking #, order # or carrier..."
        searchValue={search}
        onSearchChange={setSearch}
      />

      <DataTable
        columns={columns}
        data={shipments}
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
        onRowClick={(s) => navigate(`/shipment_detail/${s.id}`)}
        emptyTitle="No shipments found"
        emptyDescription="Shipments are created from a confirmed order's detail page."
        minWidth="1150px"
        columnWidths={["170px", "150px", "110px", "120px", "150px", "170px", "220px", "80px"]}
      />
    </div>
  )
}

export default Shipments
