import { Clock, Tag, Wallet } from "lucide-react"

import type { Order } from "@/features/sales/types"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { DetailRow } from "@/components/common/DetailRow"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { OrderActions, OrderStatusChanger } from "./OrderActions"
import { OrderHeader } from "./OrderHeader"
import { OrderLinesCard } from "./OrderLinesCard"
import { OrderProgress } from "./OrderProgress"
import { OrderPartyCards, OrderRecords } from "./OrderRecords"

/** An order for items sold from the shelf: totals, the four-step journey, lines, records. */
export function StockOrderDetail({ order, refresh }: { order: Order; refresh: () => void }) {
  const canManage = useCan("orders.manage")
  return (
    <div className="section-container space-y-6">
      <OrderHeader order={order} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="md:col-span-1 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="h-4 w-4 text-primary" />
              Totals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
            <DetailRow label="Discount">
              <span className="text-green-600">−{formatCurrency(order.discount_total)}</span>
            </DetailRow>
            <DetailRow label="Shipping">{formatCurrency(order.shipping_total)}</DetailRow>
            <DetailRow label="Tax">{formatCurrency(order.tax_total)}</DetailRow>
            {/* The Tax row above already draws the dividing line. */}
            <div className="flex items-center justify-between pt-2 text-lg font-bold">
              <span>Grand total</span>
              <span className="text-primary">{formatCurrency(order.grand_total)}</span>
            </div>
            {order.coupon_code && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/10 bg-primary/5 p-2 text-xs">
                <Tag className="h-4 w-4 text-primary" />
                Coupon <span className="font-mono font-semibold">{order.coupon_code}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="md:col-span-2 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              Status & actions
            </CardTitle>
            <CardDescription>
              {order.status === "cancelled"
                ? "Cancelled orders can't be reopened — their stock holds are already released."
                : "Where the order stands, and what you can do with it next."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <OrderProgress status={order.status} />
            <OrderStatusChanger order={order} />
            <OrderActions order={order} refresh={refresh} />
          </CardContent>
        </Card>
      </div>

      <OrderPartyCards order={order} />
      <OrderLinesCard order={order} canManage={canManage} />
      <OrderRecords order={order} refresh={refresh} />
    </div>
  )
}
