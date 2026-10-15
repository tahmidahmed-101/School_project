import { Clock, Tag, Wallet } from "lucide-react"

import type { Order } from "@/features/sales/types"
import { Card, CardContent } from "@/components/ui/card"
import { DetailRow } from "@/components/common/DetailRow"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { OrderActions, OrderStatusChanger } from "./OrderActions"
import { OrderHeader } from "./OrderHeader"
import { OrderLinesCard } from "./OrderLinesCard"
import { OrderProgress } from "./OrderProgress"
import { OrderCustomerSection, OrderRecords } from "./OrderRecords"

/** An order for items sold from the shelf: totals, the four-step journey, lines, records. */
export function StockOrderDetail({ order, refresh }: { order: Order; refresh: () => void }) {
  const canManage = useCan("orders.manage")
  return (
    <div className="section-container space-y-6">
      <OrderHeader order={order} />

      <OrderProgress status={order.status} />

      <Card className="shadow-sm">
        <CardContent className="grid grid-cols-1 gap-8 pt-6 lg:grid-cols-3">
          <section className="min-w-0 space-y-1">
            <h3 className="flex items-center gap-2 pb-1 text-base font-semibold">
              <Wallet className="h-4 w-4 text-primary" />
              Totals
            </h3>
            <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
            <DetailRow label="Discount">
              <span className="text-green-600">−{formatCurrency(order.discount_total)}</span>
            </DetailRow>
            <DetailRow label="Shipping">{formatCurrency(order.shipping_total)}</DetailRow>
            <DetailRow label="Tax">{formatCurrency(order.tax_total)}</DetailRow>
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
          </section>

          <OrderCustomerSection order={order} />

          <section className="min-w-0 space-y-5">
            <h3 className="flex items-center gap-2 text-base font-semibold">
              <Clock className="h-4 w-4 text-primary" />
              Status & actions
            </h3>
            <OrderStatusChanger order={order} />
            <OrderActions order={order} refresh={refresh} />
          </section>
        </CardContent>
      </Card>

      <OrderLinesCard order={order} canManage={canManage} />
      <OrderRecords order={order} refresh={refresh} />
    </div>
  )
}
