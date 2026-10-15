import { Tag, Wallet } from "lucide-react"

import type { Order } from "@/features/sales/types"
import { Card, CardContent } from "@/components/ui/card"
import { DetailRow } from "@/components/common/DetailRow"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { OrderHeader } from "./OrderHeader"
import { OrderLinesCard } from "./OrderLinesCard"
import { OrderProgress } from "./OrderProgress"
import { OrderCustomerSection, OrderRecordsSection } from "./OrderRecords"

/** An order for items sold from the shelf: totals, the four-step journey, lines, records. */
export function StockOrderDetail({ order, refresh }: { order: Order; refresh: () => void }) {
  const canManage = useCan("orders.manage")
  return (
    <div className="section-container space-y-6">
      <OrderHeader order={order} refresh={refresh} />

      <OrderProgress order={order} />

      <Card className="shadow-sm">
        <CardContent className="space-y-8 pt-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <OrderCustomerSection order={order} />
            <section className="min-w-0 space-y-1">
              <h3 className="flex items-center gap-2 pb-1 text-base font-semibold">
                <Wallet className="h-4 w-4 text-primary" />
                Totals
              </h3>
              <DetailRow label="Subtotal">{formatCurrency(order.subtotal)}</DetailRow>
              {Number(order.discount_total) > 0 && (
                <DetailRow label="Discount">
                  <span className="text-green-600">−{formatCurrency(order.discount_total)}</span>
                </DetailRow>
              )}
              {Number(order.shipping_total) > 0 && <DetailRow label="Shipping">{formatCurrency(order.shipping_total)}</DetailRow>}
              {Number(order.tax_total) > 0 && <DetailRow label="Tax">{formatCurrency(order.tax_total)}</DetailRow>}
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
          </div>
          <OrderRecordsSection order={order} refresh={refresh} />
        </CardContent>
      </Card>

      <OrderLinesCard order={order} canManage={canManage} />
    </div>
  )
}
