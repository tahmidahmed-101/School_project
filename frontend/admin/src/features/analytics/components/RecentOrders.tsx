import { Link } from "react-router-dom"
import { ShoppingBag } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/common/StatusBadge"
import type { StatusTone } from "@/components/common/status-tones"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
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
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  const canOpenOrders = hasPermission(permissions, "orders.view")

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
      <div className="overflow-x-auto">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Order</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="pr-5">Placed</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders?.map((o) => {
              const units = o.items.reduce((s, line) => s + line.quantity, 0)
              return (
                <TableRow key={o.order_id}>
                  <TableCell className="pl-5">
                    {canOpenOrders ? (
                      <Link to={`/order_detail/${o.order_id}`} className="font-medium text-primary hover:underline">
                        {o.id}
                      </Link>
                    ) : (
                      <span className="font-medium">{o.id}</span>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {units} {units === 1 ? "item" : "items"}
                      {o.region !== "—" && ` · ${o.region}`}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate">{o.customer.name}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatCurrency(o.total_amount)}</TableCell>
                  <TableCell className="text-muted-foreground uppercase text-xs">{humanize(o.payment_method)}</TableCell>
                  <TableCell>
                    <StatusBadge status={o.status} tone={STATUS_TONE[o.status]} />
                  </TableCell>
                  <TableCell className="pr-5 text-xs text-muted-foreground">{formatDateTime(o.created_at)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </ReportWidget>
  )
}
