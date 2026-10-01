import { useCallback, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ClipboardList, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeading } from "@/components/common/PageHeading"
import { formatCurrency, formatDate } from "@/lib/format"
import { useAppDispatch } from "@/app/hooks"
import { useDocumentTitle } from "@/hooks/use-document-title"

import { fetchAll } from "../slices/purchaseOrderSlice"
import type { PurchaseOrder } from "../types"
import { useCanManagePurchasing, useDebouncedValue, useProcurementSelector } from "../hooks/useProcurement"
import { PO_STATUS_TONE, poOrderedTotal, poUnitsOrdered, poUnitsReceived } from "../utils"

const PAGE_SIZE = 20
type Option = { label: string; value: string }

const STATUS_OPTIONS: Option[] = [
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Received", value: "received" },
  { label: "Cancelled", value: "cancelled" },
]

const PurchaseOrders = () => {
  useDocumentTitle("Purchase Orders")
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data, isFetchingList, error, totalItems, meta } = useProcurementSelector((state) => state.purchaseOrders)
  const canManage = useCanManagePurchasing()

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search)
  const [status, setStatus] = useState<Option | null>(null)
  const [ordering, setOrdering] = useState<Option | null>(null)

  const load = useCallback(
    () =>
      dispatch(
        fetchAll({
          page,
          page_size: PAGE_SIZE,
          ...(debouncedSearch ? { search: debouncedSearch } : {}),
          ...(status ? { status: status.value } : {}),
          ...(ordering ? { ordering: ordering.value } : {}),
        })
      ),
    [dispatch, page, debouncedSearch, status, ordering]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      accessorKey: "po_number",
      header: "PO #",
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.po_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: "SUPPLIER",
      cell: ({ row }) => <span className="text-sm font-medium text-foreground">{row.original.supplier_name}</span>,
    },
    {
      accessorKey: "order_date",
      header: "ORDER DATE",
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.order_date)}</span>,
    },
    {
      id: "received",
      header: "RECEIVED",
      cell: ({ row }) => {
        const ordered = poUnitsOrdered(row.original)
        const received = poUnitsReceived(row.original)
        return (
          <div className="space-y-1 pr-4">
            <span className="text-xs text-muted-foreground">
              {received} / {ordered} units
            </span>
            <Progress value={ordered ? (received / ordered) * 100 : 0} className="h-1.5" />
          </div>
        )
      },
    },
    {
      id: "total",
      header: "TOTAL",
      cell: ({ row }) => (
        <span className="text-sm font-semibold whitespace-nowrap">{formatCurrency(poOrderedTotal(row.original))}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} tone={PO_STATUS_TONE[row.original.status]} />,
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions itemName={row.original.po_number} viewUrl={`/purchasing/orders/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading
          title="Purchase Orders"
          description="Draft, submit and receive stock orders from suppliers."
        />
        {canManage && (
          <Button size="action" asChild>
            <Link to="/purchasing/orders/new">
              <Plus className="size-5" /> New Purchase Order
            </Link>
          </Button>
        )}
      </div>

      <FilterToolbar
        searchPlaceholder="Search PO number..."
        searchValue={search}
        onSearchChange={(v) => {
          setSearch(v)
          setPage(1)
        }}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={STATUS_OPTIONS}
                placeholder="Status"
                value={status}
                onValueChange={(v) => {
                  setStatus(v)
                  setPage(1)
                }}
              />
            ),
          },
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={[
                  { label: "Newest order date", value: "-order_date" },
                  { label: "Oldest order date", value: "order_date" },
                  { label: "Recently created", value: "-created_at" },
                ]}
                placeholder="Sort"
                value={ordering}
                onValueChange={(v) => {
                  setOrdering(v)
                  setPage(1)
                }}
              />
            ),
          },
        ]}
      />

      <DataTable
        columns={columns}
        data={data}
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
        onRowClick={(po) => navigate(`/purchasing/orders/${po.id}`)}
        emptyIcon={ClipboardList}
        emptyTitle="No purchase orders"
        emptyActionLabel={canManage ? "New Purchase Order" : undefined}
        onEmptyAction={canManage ? () => navigate("/purchasing/orders/new") : undefined}
        minWidth="980px"
        columnWidths={["140px", "200px", "120px", "170px", "140px", "110px", "80px"]}
      />
    </div>
  )
}

export default PurchaseOrders
