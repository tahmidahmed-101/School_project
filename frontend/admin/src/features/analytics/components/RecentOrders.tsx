import type { ColumnDef } from "@tanstack/react-table"
import { Link } from "react-router-dom"
import { ShoppingBag } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { useCan } from "@/hooks/use-can"
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

interface Props {
  orders: DashboardOrder[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function RecentOrders({ orders, isLoading, error, onRetry, className }: Props) {
  const canOpenOrders = useCan("orders.view")

  const columns: ColumnDef<DashboardOrder>[] = [
    {
      id: "order",
      header: "Order",
      cell: ({ row: { original: o } }) => {
        const units = o.items.reduce((sum, line) => sum + line.quantity, 0)
        return (
          <div className="min-w-0">
            {canOpenOrders ? (
              <Link to={`/order_detail/${o.order_id}`} className="font-medium text-primary hover:underline">
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
      title="Recent orders"
      description="Latest orders placed in this period"
      link={canOpenOrders ? { to: "/orders", label: "View all" } : undefined}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={!orders?.length}
      emptyIcon={ShoppingBag}
      emptyTitle="No orders in this period"
      emptyDescription="New orders will show up here."
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
