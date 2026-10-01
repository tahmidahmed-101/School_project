import { useCallback, useEffect, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import type { DateRange } from "react-day-picker"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { format } from "date-fns"
import { XIcon } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import { PageHeading } from "@/components/common/PageHeading"
import { TableActions } from "@/components/common/TableActions"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { Badge } from "@/components/ui/badge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllPayments } from "@/features/payments/slices/paymentSlice"
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  paymentMethodLabel,
  type Payment,
} from "@/features/payments/types"
import { DatePicker } from "@/features/sales/components/DatePicker"
import FilterToolbar from "@/components/common/FilterToolBar"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatCurrency } from "@/lib/format"

const PAGE_SIZE = 20
const toLocalDay = (date: Date | undefined) => (date ? format(date, "yyyy-MM-dd") : undefined)

type Option = { label: string; value: string }

const Payments = () => {
  useDocumentTitle("Payments")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { data: payments, isFetchingList, error, totalItems, meta } = useAppSelector((state) => state.payments)

  // AdminPaymentListView has no text search; ?order_id=… narrows to one order.
  const [searchParams, setSearchParams] = useSearchParams()
  const orderId = searchParams.get("order_id") ?? ""

  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [methodFilter, setMethodFilter] = useState<Option | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const withPageReset =
    <T,>(setter: (v: T) => void) =>
    (value: T) => {
      setter(value)
      setPage(1)
    }

  const start = toLocalDay(dateRange?.from)
  const end = toLocalDay(dateRange?.to ?? dateRange?.from)
  const status = statusFilter?.value
  const method = methodFilter?.value

  const load = useCallback(
    () =>
      dispatch(
        fetchAllPayments({
          page,
          page_size: PAGE_SIZE,
          ...(orderId ? { order_id: orderId } : {}),
          ...(status ? { status } : {}),
          ...(method ? { method } : {}),
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
        })
      ),
    [dispatch, page, orderId, status, method, start, end]
  )

  useEffect(() => {
    const request = load()
    return () => request.abort()
  }, [load])

  const clearOrder = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("order_id")
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  const columns: ColumnDef<Payment>[] = [
    {
      accessorKey: "order_number",
      header: "ORDER",
      cell: ({ row }) => (
        <Link
          to={`/order_detail/${row.original.order_id}`}
          className="text-sm font-medium text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
          data-no-row-click="true"
        >
          {row.original.order_number}
        </Link>
      ),
    },
    {
      accessorKey: "method",
      header: "METHOD",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{paymentMethodLabel(row.original.method)}</span>,
    },
    {
      accessorKey: "amount",
      header: "AMOUNT",
      cell: ({ row }) => <span className="text-sm font-semibold">{formatCurrency(row.original.amount)}</span>,
    },
    {
      accessorKey: "refunded_amount",
      header: "REFUNDED",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {Number(row.original.refunded_amount) > 0 ? formatCurrency(row.original.refunded_amount) : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "STATUS",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "gateway_reference",
      header: "REFERENCE",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">{row.original.gateway_reference || "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "ACTION",
      cell: ({ row }) => (
        <TableActions
          itemName={`Payment for order ${row.original.order_number}`}
          viewUrl={`/payment_detail/${row.original.id}`}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeading title="Payments" description="Track captured payments and process refunds." />

      {/* No text search on this endpoint — only status / method / date filters. */}
      <FilterToolbar
        datePicker={<DatePicker value={dateRange} onChange={withPageReset(setDateRange)} />}
        inlineCount={3}
        filters={[
          {
            active: Boolean(statusFilter),
            component: (
              <ExampleComboboxCustomItems
                frameworks={PAYMENT_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={withPageReset(setStatusFilter)}
              />
            ),
          },
          {
            active: Boolean(methodFilter),
            component: (
              <ExampleComboboxCustomItems
                frameworks={PAYMENT_METHOD_OPTIONS}
                placeholder="Method"
                value={methodFilter}
                onValueChange={withPageReset(setMethodFilter)}
              />
            ),
          },
        ]}
      />

      {orderId && (
        <div className="mt-3">
          <Badge variant="secondary" className="gap-1.5">
            Filtered to one order
            <button type="button" onClick={clearOrder} aria-label="Clear order filter">
              <XIcon className="size-3" />
            </button>
          </Badge>
        </div>
      )}

      <DataTable
        columns={columns}
        data={payments}
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
        onRowClick={(payment) => navigate(`/payment_detail/${payment.id}`)}
        emptyTitle="No payments found"
        emptyDescription="Try adjusting the filters."
        minWidth="950px"
        columnWidths={["150px", "150px", "130px", "120px", "120px", "180px", "90px"]}
      />
    </div>
  )
}

export default Payments
