import { Link, useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { ClipboardList, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { StatusBadge } from "@/components/common/StatusBadge"
import { PageHeader } from "@/components/common/PageHeader"
import { DateCell, MoneyCell } from "@/components/common/cells"
import type { Option } from "@/lib/types"
import { useAppDispatch } from "@/app/hooks"
import { useKind } from "@/hooks/use-kind"
import { purchasingBase, purchasingTitle } from "../lib/kind"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"

import { fetchAll } from "../slices/purchaseOrderSlice"
import type { PurchaseOrder } from "../types"
import { useCanManagePurchasing, useProcurementSelector } from "../hooks/useProcurement"
import { useStatusSortFilters } from "../hooks/useStatusSortFilters"
import { PO_STATUS_TONE, poOrderedTotal, poUnitsOrdered, poUnitsReceived } from "../utils"

const STATUS_OPTIONS: Option[] = [
  { label: "Draft", value: "draft" },
  { label: "Submitted", value: "submitted" },
  { label: "Received", value: "received" },
  { label: "Cancelled", value: "cancelled" },
]

const SORT_OPTIONS: Option[] = [
  { label: "Newest order date", value: "-order_date" },
  { label: "Oldest order date", value: "order_date" },
  { label: "Recently created", value: "-created_at" },
]

const PurchaseOrdersList = () => {
  const kind = useKind()
  const base = purchasingBase(kind)
  const title = purchasingTitle(kind, "Purchase orders")
  useDocumentTitle(title)
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const state = useProcurementSelector((state) => state.purchaseOrders)
  const canManage = useCanManagePurchasing()

  const filters = useStatusSortFilters(STATUS_OPTIONS, SORT_OPTIONS)
  const list = useListPage({ fetch: (p) => dispatch(fetchAll(p)), state, params: { ...filters.params, kind } })

  const columns: ColumnDef<PurchaseOrder>[] = [
    {
      accessorKey: "po_number",
      header: "PO #",
      cell: ({ row }) => <span className="font-mono text-sm font-semibold text-primary">{row.original.po_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: "SUPPLIER",
      // Long supplier names wrap onto a second line rather than being cut off.
      cell: ({ row }) => (
        <span className="block whitespace-normal break-words text-sm font-medium text-foreground">
          {row.original.supplier_name}
        </span>
      ),
    },
    {
      accessorKey: "order_date",
      header: "ORDER DATE",
      cell: ({ row }) => <DateCell value={row.original.order_date} className="text-muted-foreground" />,
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
      cell: ({ row }) => <MoneyCell value={poOrderedTotal(row.original)} emphasis />,
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} tone={PO_STATUS_TONE[row.original.status]} />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions itemName={row.original.po_number} viewUrl={`${base}/orders/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title={title}
        actions={
          canManage && (
            <Button size="action" asChild>
              <Link to={`${base}/orders/new`}>
                <Plus className="size-5" /> New Purchase Order
              </Link>
            </Button>
          )
        }
      />

      <FilterToolbar
        searchPlaceholder="Search PO number..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        filters={filters.filters}
      />

      <DataTable
        columns={columns}
        data={state.data}
        {...list.tableProps}
        onRowClick={(po) => navigate(`${base}/orders/${po.id}`)}
        emptyIcon={ClipboardList}
        emptyTitle="No purchase orders"
        emptyActionLabel={canManage ? "New Purchase Order" : undefined}
        onEmptyAction={canManage ? () => navigate(`${base}/orders/new`) : undefined}
        minWidth="900px"
        columnWidths={["125px", "auto", "105px", "145px", "130px", "125px", "80px"]}
      />
    </div>
  )
}

const PurchaseOrders = () => <PurchaseOrdersList key={useKind()} />

export default PurchaseOrders
