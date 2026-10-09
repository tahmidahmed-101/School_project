import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { ShoppingBag } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { useCan } from "@/hooks/use-can"
import { withKind, type Kind } from "@/hooks/use-kind"
import { formatCurrency, formatDateTime, humanize } from "@/lib/format"
import type { DashboardOrder } from "../types"
import { ReportWidget } from "./ReportWidget"

// The dashboard serializer sends display labels (selectors/dashboards.py _STATUS_BADGE).
const STATUS_TONE: Record<string, StatusTone> = {
  Pending: "warning",
  "Awaiting payment": "warning",
  Processing: "info",
  Fulfilled: "success",
  Refunded: "secondary",
}

const COPY = {
  stock: {
    title: "Recent stock orders",
    description: "Latest stock orders placed in this period",
    list: "/orders",
    emptyTitle: "No stock orders in this period",
    emptyDescription: "New orders will show up here.",
  },
  preorder: {
    title: "Recent pre-orders",
    description: "Latest pre-orders placed in this period",
    list: "/preorders",
    emptyTitle: "No pre-orders in this period",
    emptyDescription: "New pre-orders will show up here.",
  },
} satisfies Record<Kind, Record<string, string>>

interface Props {
  kind: Kind
  orders: DashboardOrder[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function RecentOrders({ kind, orders, isLoading, error, onRetry, className }: Props) {
  const canOpenOrders = useCan("orders.view")
  const copy = COPY[kind]

  const columns: ColumnDef<DashboardOrder>[] = [
    {
      id: "order",
      header: "Order",
      cell: ({ row: { original: o } }) => {
        const units = o.items.reduce((sum, line) => sum + line.quantity, 0)
        return (
          <div className="min-w-0">
            {canOpenOrders ? (
              <Link to={withKind(`/order_detail/${o.order_id}`, kind)} className="font-medium text-primary hover:underline">
                {o.id}
              </Link>
            ) : (
              <span className="font-medium">{o.id}</span>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {units} {units === 1 ? "item" : "items"}
              {o.region !== "—" && ` · ${o.region}`}
            </p>
          </div>
        )
      },
    },
    {
      id: "customer",
      header: "Customer",
      cell: ({ row }) => <span className="block truncate">{row.original.customer.name}</span>,
    },
    {
      id: "total",
      header: "Total",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatCurrency(row.original.total_amount)}</span>,
    },
    {
      id: "payment",
      header: "Payment",
      cell: ({ row }) => (
        <span className="text-xs uppercase text-muted-foreground">{humanize(row.original.payment_method)}</span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} tone={STATUS_TONE[row.original.status]} />,
    },
    {
      id: "placed",
      header: "Placed",
      // Date over time, so the column stays narrow enough for the widget's width.
      cell: ({ row }) => {
        const [date, time] = formatDateTime(row.original.created_at).split(", ")
        return (
          <span className="text-xs text-muted-foreground">
            <span className="block">{date}</span>
            {time && <span className="block">{time}</span>}
          </span>
        )
      },
    },
  ]

  return (
    <ReportWidget
      title={copy.title}
      description={copy.description}
      link={canOpenOrders ? { to: copy.list, label: "View all" } : undefined}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={!orders?.length}
      emptyIcon={ShoppingBag}
      emptyTitle={copy.emptyTitle}
      emptyDescription={copy.emptyDescription}
      skeleton={
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      }
      className={className}
      contentClassName="px-0 pb-2 pt-0"
    >
      <DataTable
        embedded
        showPagination={false}
        columns={columns}
        data={orders ?? []}
        minWidth="700px"
        columnWidths={["130px", "auto", "110px", "80px", "150px", "100px"]}
      />
    </ReportWidget>
  )
}
