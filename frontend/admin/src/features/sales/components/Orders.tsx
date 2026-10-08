import { useState } from "react"
import type { DateRange } from "react-day-picker"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate, useSearchParams } from "react-router-dom"
import { PlusIcon, XIcon } from "lucide-react"

import { DatePicker } from "@/components/common/DatePicker"
import { Combobox } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeader } from "@/components/common/PageHeader"
import { SortSelect } from "@/components/common/SortSelect"
import { ExportButton } from "@/components/common/ExportButton"
import { DateCell, MoneyCell, TextCell } from "@/components/common/cells"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/sales/slices/orderSlice"
import { ORDER_STATUS_OPTIONS, PREORDER_STAGE_OPTIONS, type Order } from "@/features/sales/types"
import { PreorderBook } from "@/features/sales/components/PreorderBook"
import { paymentMethodLabel } from "@/features/payments/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { downloadFile } from "@/lib/download"
import { useCan } from "@/hooks/use-can"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useListPage } from "@/hooks/use-list-page"
import { toISODate } from "@/lib/format"
import type { Option } from "@/lib/types"

// AdminOrderListView ordering_fields: created_at, grand_total.
const ORDERING_OPTIONS: Option[] = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "Highest total", value: "-grand_total" },
  { label: "Lowest total", value: "grand_total" },
]

// Sent as `order_type` (selectors/sales_orders.py orders_list).
const ORDER_KIND_OPTIONS: Option[] = [
  { value: "preorder", label: "Pre-order" },
  { value: "stock", label: "Stock" },
]

const Orders = () => {
  useDocumentTitle("Orders")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const ordersState = useAppSelector((state) => state.orders)

  // ?customer_id=… lets other pages (e.g. a customer profile) link to that customer's orders.
  const [searchParams, setSearchParams] = useSearchParams()
  const customerId = searchParams.get("customer_id") ?? ""

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [stageFilter, setStageFilter] = useState<Option | null>(null)
  const [kindFilter, setKindFilter] = useState<Option | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [ordering, setOrdering] = useState<Option | null>(ORDERING_OPTIONS[0])

  const from = dateRange?.from
  const to = dateRange?.to ?? dateRange?.from

  // Exactly the params AdminOrderListView / OrderQuerysetMixin read (shared with /export/).
  const list = useListPage({
    fetch: (p) => dispatch(fetchAll(p)),
    state: ordersState,
    params: {
      status: statusFilter?.value,
      preorder_stage: stageFilter?.value,
      order_type: kindFilter?.value,
      start: from ? toISODate(from) : undefined,
      end: to ? toISODate(to) : undefined,
      customer_id: customerId,
      ordering: ordering?.value ?? ORDERING_OPTIONS[0].value,
    },
  })

  const clearCustomer = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("customer_id")
    setSearchParams(next, { replace: true })
  }

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "order_number",
      header: "ORDER #",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-inter text-sm font-medium text-primary">{row.original.order_number}</span>
          {row.original.order_type === "preorder" && <Badge variant="secondary">Pre-order</Badge>}
        </div>
      ),
    },
    {
      id: "customer",
      header: "CUSTOMER",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.original.customer_name || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{row.original.customer_email}</p>
        </div>
      ),
    },
    {
      accessorKey: "grand_total",
      header: "TOTAL",
      cell: ({ row }) => <MoneyCell value={row.original.grand_total} emphasis />,
    },
    {
      id: "payment",
      header: "PAYMENT",
      cell: ({ row }) => {
        const payment = row.original.payments?.[0]
        if (!payment) return <TextCell value={null} />
        return (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={payment.status} />
            <span className="text-xs text-muted-foreground">{paymentMethodLabel(payment.method)}</span>
          </div>
        )
      },
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "created_at",
      header: "DATE",
      cell: ({ row }) => <DateCell value={row.original.created_at} className="text-muted-foreground" />,
    },
    {
      id: "actions",
      header: "ACTIONS",
      cell: ({ row }) => (
        <TableActions itemName={`Order ${row.original.order_number}`} viewUrl={`/order_detail/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader
        title="Orders"
        actions={
          <>
            <ExportButton onExport={() => downloadFile("/admin/orders/export/", "orders.csv", list.query)} />
            {canManage && (
              <Button size="action" onClick={() => navigate("/orders/new")}>
                <PlusIcon className="size-5" /> New Order
              </Button>
            )}
          </>
        }
      />

      {kindFilter?.value === "preorder" && <PreorderBook canManage={canManage} onAllocated={list.reload} />}

      <FilterToolbar
        searchPlaceholder="Search order # or email..."
        searchValue={list.search}
        onSearchChange={list.setSearch}
        datePicker={<DatePicker value={dateRange} onChange={setDateRange} />}
        filters={[
          {
            component: (
              <Combobox
                options={ORDER_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
              />
            ),
          },
          {
            component: (
              <Combobox
                options={ORDER_KIND_OPTIONS}
                placeholder="Order type"
                value={kindFilter}
                onValueChange={setKindFilter}
              />
            ),
          },
          {
            component: (
              <Combobox
                options={PREORDER_STAGE_OPTIONS}
                placeholder="Pre-order stage"
                value={stageFilter}
                onValueChange={setStageFilter}
              />
            ),
          },
          {
            component: <SortSelect options={ORDERING_OPTIONS} value={ordering} onChange={setOrdering} />,
          },
        ]}
      />

      {customerId && (
        <div className="mt-3">
          <Badge variant="secondary" className="gap-1.5">
            Filtered to one customer
            <button type="button" onClick={clearCustomer} aria-label="Clear customer filter">
              <XIcon className="size-3" />
            </button>
          </Badge>
        </div>
      )}

      <div>
        <DataTable
          columns={columns}
          data={ordersState.data}
          {...list.tableProps}
          onRowClick={(order) => navigate(`/order_detail/${order.id}`)}
          emptyTitle="No orders found"
          emptyDescription="Try adjusting the search or filters."
          minWidth="1050px"
          columnWidths={["140px", "220px", "120px", "130px", "130px", "120px", "80px"]}
        />
      </div>
    </div>
  )
}

export default Orders
