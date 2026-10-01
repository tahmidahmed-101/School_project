import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import type { DateRange } from "react-day-picker"
import { Link, useNavigate, useSearchParams } from "react-router-dom"
import { XIcon } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { ExampleComboboxCustomItems } from "@/components/common/ComboBox"
import { MoneyCell, TextCell } from "@/components/common/cells"
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
import { useListPage } from "@/hooks/use-list-page"
import { toISODate } from "@/lib/format"
import type { Option } from "@/lib/types"

const Payments = () => {
  useDocumentTitle("Payments")

  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const paymentsState = useAppSelector((state) => state.payments)

  // AdminPaymentListView has no text search; ?order_id=… narrows to one order.
  const [searchParams, setSearchParams] = useSearchParams()
  const orderId = searchParams.get("order_id") ?? ""

  const [statusFilter, setStatusFilter] = useState<Option | null>(null)
  const [methodFilter, setMethodFilter] = useState<Option | null>(null)
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)

  const from = dateRange?.from
  const to = dateRange?.to ?? dateRange?.from

  const list = useListPage({
    fetch: (p) => dispatch(fetchAllPayments(p)),
    state: paymentsState,
    params: {
      order_id: orderId,
      status: statusFilter?.value,
      method: methodFilter?.value,
      start: from ? toISODate(from) : undefined,
      end: to ? toISODate(to) : undefined,
    },
  })

  const clearOrder = () => {
    const next = new URLSearchParams(searchParams)
    next.delete("order_id")
    setSearchParams(next, { replace: true })
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
      cell: ({ row }) => <MoneyCell value={row.original.amount} emphasis />,
    },
    {
      accessorKey: "refunded_amount",
      header: "REFUNDED",
      cell: ({ row }) =>
        Number(row.original.refunded_amount) > 0 ? (
          <MoneyCell value={row.original.refunded_amount} className="text-muted-foreground" />
        ) : (
          <TextCell value={null} />
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
      header: "ACTIONS",
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
      <PageHeader title="Payments" description="Track captured payments and process refunds." />

      {/* No text search on this endpoint — only status / method / date filters. */}
      <FilterToolbar
        datePicker={<DatePicker value={dateRange} onChange={setDateRange} />}
        inlineCount={3}
        filters={[
          {
            active: Boolean(statusFilter),
            component: (
              <ExampleComboboxCustomItems
                frameworks={PAYMENT_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
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
                onValueChange={setMethodFilter}
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
        data={paymentsState.data}
        {...list.tableProps}
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
