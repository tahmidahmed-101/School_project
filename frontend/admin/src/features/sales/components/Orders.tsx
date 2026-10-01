import { useCallback, useEffect, useState } from "react"
import type { DateRange } from "react-day-picker"
import type { ColumnDef } from "@tanstack/react-table"
import { useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { toast } from "sonner"
import { DownloadIcon, Loader2, PlusIcon, XIcon } from "lucide-react"

import { DatePicker } from "./DatePicker"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { DataTable } from "@/components/common/data-table"
import FilterToolbar from "@/components/common/FilterToolBar"
import { TableActions } from "@/components/common/TableActions"
import { PageHeading } from "@/components/common/PageHeading"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAll } from "@/features/sales/slices/orderSlice"
import { ORDER_STATUS_OPTIONS, type Order } from "@/features/sales/types"
import { paymentMethodLabel } from "@/features/payments/types"
import { StatusBadge } from "@/components/common/StatusBadge"
import { downloadFile } from "@/features/sales/shared/download"
import { useCan } from "@/features/sales/shared/useCan"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getApiErrorMessage } from "@/lib/api/client"
import { formatCurrency, formatDate } from "@/lib/format"

const PAGE_SIZE = 20

// AdminOrderListView ordering_fields: created_at, grand_total.
const ORDERING_OPTIONS = [
  { label: "Newest first", value: "-created_at" },
  { label: "Oldest first", value: "created_at" },
  { label: "Highest total", value: "-grand_total" },
  { label: "Lowest total", value: "grand_total" },
]

// A picked day as local "YYYY-MM-DD" (the backend's start/end format), not a UTC-shifted ISO string.
const toLocalDay = (date: Date | undefined) => (date ? format(date, "yyyy-MM-dd") : undefined)

type Option = { label: string; value: string }

const Orders = () => {
  useDocumentTitle("Orders")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const canManage = useCan("orders.manage")
  const { data: orders, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.orders)

  // ?customer_id=… lets other pages (e.g. a customer profile) link to that customer's orders.
  const [searchParams, setSearchParams] = useSearchParams()
  const customerId = searchParams.get("customer_id") ?? ""

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [ordering, setOrdering] = useState("-created_at")
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const next = search.trim()
    if (next === debouncedSearch) return
    const t = setTimeout(() => {
      setDebouncedSearch(next)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search, debouncedSearch])

  const withPageReset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const start = toLocalDay(dateRange?.from)
  const end = toLocalDay(dateRange?.to ?? dateRange?.from)

  // Exactly the params AdminOrderListView / OrderQuerysetMixin read (shared with /export/).
  const filters = {
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(statusFilter ? { status: statusFilter.value } : {}),
    ...(start ? { start } : {}),
    ...(end ? { end } : {}),
    ...(customerId ? { customer_id: customerId } : {}),
    ordering,
  }
  const filterKey = JSON.stringify(filters)

  const loadOrders = useCallback(
    () => dispatch(fetchAll({ page, page_size: PAGE_SIZE, ...JSON.parse(filterKey) })),
    [dispatch, page, filterKey]
  )

  useEffect(() => {
    const request = loadOrders()
    return () => request.abort()
  }, [loadOrders])

  const handleExport = async () => {
    setExporting(true)
    try {
      await downloadFile("/admin/orders/export/", "orders.csv", filters)
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to export orders"))
    } finally {
      setExporting(false)
    }
  }

  const clearCustomer = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("customer_id")
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const columns: ColumnDef<Order>[] = [
    {
      accessorKey: "order_number",
      header: "ORDER #",
      cell: ({ row }) => (
        <span className="font-inter text-sm font-medium text-primary">{row.original.order_number}</span>
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
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-foreground">{formatCurrency(row.original.grand_total)}</span>
      ),
    },
    {
      id: "payment",
      header: "PAYMENT",
      cell: ({ row }) => {
        const payment = row.original.payments?.[0]
        if (!payment) return <span className="text-sm text-muted-foreground">—</span>
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
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground whitespace-nowrap">{formatDate(row.original.created_at)}</span>
      ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions itemName={`Order ${row.original.order_number}`} viewUrl={`/order_detail/${row.original.id}`} />
      ),
    },
  ]

  return (
    <div className="section-container">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeading title="Orders" description="Monitor and manage all customer orders." />
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="action" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-5 animate-spin" /> : <DownloadIcon className="size-5" />} Export CSV
          </Button>
          {canManage && (
            <Button size="action" onClick={() => navigate("/orders/new")}>
              <PlusIcon className="size-5" /> New Order
            </Button>
          )}
        </div>
      </div>

      <FilterToolbar
        searchPlaceholder="Search order # or email..."
        searchValue={search}
        onSearchChange={setSearch}
        datePicker={<DatePicker value={dateRange} onChange={withPageReset(setDateRange)} />}
        filters={[
          {
            component: (
              <ExampleComboboxCustomItems
                frameworks={ORDER_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={withPageReset(setStatusFilter)}
              />
            ),
          },
          {
            component: (
              <Select value={ordering} onValueChange={withPageReset(setOrdering)}>
                <SelectTrigger className="h-9 w-[150px]" aria-label="Sort orders">
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
          data={orders}
          isLoading={isFetchingList}
          error={error}
          onRetry={() => {
            loadOrders()
          }}
          manualPagination
          pageSize={PAGE_SIZE}
          pageIndex={page - 1}
          pageCount={meta?.totalPages ?? 1}
          totalCount={totalItems}
          onPageChange={(index) => setPage(index + 1)}
          onRowClick={(order) => navigate(`/order_detail/${order.id}`)}
          emptyTitle="No orders found"
          emptyDescription="Try adjusting the search or filters."
          minWidth="1050px"
          columnWidths={["140px", "220px", "120px", "130px", "130px", "120px", "90px"]}
        />
      </div>
    </div>
  )
}

export default Orders
