import { useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import type { DateRange } from "react-day-picker"
import { useNavigate, useSearchParams } from "react-router-dom"
import { XIcon } from "lucide-react"

import { DataTable } from "@/components/common/data-table"
import { PageHeader } from "@/components/common/PageHeader"
import { TableActions } from "@/components/common/TableActions"
import { Combobox } from "@/components/common/ComboBox"
import { LinkCell, MoneyCell, TextCell } from "@/components/common/cells"
import { Badge } from "@/components/ui/badge"
import { useAppDispatch, useAppSelector } from "@/app/hooks"
import { fetchAllPayments } from "@/features/payments/slices/paymentSlice"
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_STATUS_OPTIONS,
  paymentMethodLabel,
  type Payment,
} from "@/features/payments/types"
import { DatePicker } from "@/components/common/DatePicker"
import FilterToolbar from "@/components/common/FilterToolBar"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { useKind, withKind } from "@/hooks/use-kind"
import { useListPage } from "@/hooks/use-list-page"
import { formatCurrency, toISODate } from "@/lib/format"
import { usePreorderReport } from "@/features/sales/hooks/usePreorderReport"
import type { Option } from "@/lib/types"

/** Money received and still owed across open pre-orders; a payment row carries neither. */
function PreorderMoney() {
  const { report } = usePreorderReport()
  if (!report) return null
  const { summary } = report
  return (
    <div className="mb-4 grid grid-cols-1 gap-4 rounded-lg bg-muted/40 p-4 sm:grid-cols-3">
      <div>
        <span className="block text-xs text-muted-foreground">Open pre-orders</span>
        <span className="font-semibold text-foreground">
          {summary.open_orders} worth {formatCurrency(summary.order_value)}
        </span>
      </div>
      <div>
        <span className="block text-xs text-muted-foreground">Received so far</span>
        <span className="font-semibold text-foreground">{formatCurrency(summary.deposits_held)}</span>
      </div>
      <div>
        <span className="block text-xs text-muted-foreground">Still owed by customers</span>
        <span className="font-semibold text-foreground">{formatCurrency(summary.balances_outstanding)}</span>
      </div>
    </div>
  )
}

const PaymentsList = () => {
  const kind = useKind()
  const isPreorder = kind === "preorder"
  const title = isPreorder ? "Pre-order payments" : "Payments"
  useDocumentTitle(title)

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
      kind,
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
      header: isPreorder ? "PRE-ORDER" : "ORDER",
      cell: ({ row }) => (
        <LinkCell to={withKind(`/order_detail/${row.original.order_id}`, kind)} className="font-medium">
          {row.original.order_number}
        </LinkCell>
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
          itemName={`Payment for ${isPreorder ? "pre-order" : "order"} ${row.original.order_number}`}
          viewUrl={withKind(`/payment_detail/${row.original.id}`, kind)}
        />
      ),
    },
  ]

  return (
    <div className="section-container">
      <PageHeader title={title} />

      {isPreorder && <PreorderMoney />}

      {/* No text search on this endpoint — only status / method / date filters. */}
      <FilterToolbar
        datePicker={<DatePicker value={dateRange} onChange={setDateRange} />}
        inlineCount={3}
        filters={[
          {
            active: Boolean(statusFilter),
            component: (
              <Combobox
                options={PAYMENT_STATUS_OPTIONS}
                placeholder="Status"
                value={statusFilter}
                onValueChange={setStatusFilter}
              />
            ),
          },
          {
            active: Boolean(methodFilter),
            component: (
              <Combobox
                options={PAYMENT_METHOD_OPTIONS}
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
            {isPreorder ? "Filtered to one pre-order" : "Filtered to one order"}
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
        onRowClick={(payment) => navigate(withKind(`/payment_detail/${payment.id}`, kind))}
        emptyTitle="No payments found"
        emptyDescription="Try adjusting the filters."
        minWidth="950px"
        columnWidths={["150px", "150px", "130px", "120px", "120px", "180px", "80px"]}
      />
    </div>
  )
}

// Both halves render this component on different routes; the key gives each half its own filters and page.
const PaymentsPage = () => <PaymentsList key={useKind()} />

export default PaymentsPage
