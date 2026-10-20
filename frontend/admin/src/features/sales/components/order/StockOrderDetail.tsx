import { Tag, Wallet } from "lucide-react"

import type { Order } from "@/features/sales/types"
import { DetailRow } from "@/components/common/DetailRow"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { OrderHeader } from "./OrderHeader"
import { OrderLinesCard } from "./OrderLinesCard"
import { OrderProgress } from "./OrderProgress"
import { OrderOverview, OrderRecords } from "./OrderRecords"

/** An order for items sold from the shelf: the journey, customer and totals, lines, then its records. */
export function StockOrderDetail({ order, refresh }: { order: Order; refresh: () => void }) {
  const canManage = useCan("orders.manage")
  return (
    <div className="section-container space-y-6">
      <OrderHeader order={order} refresh={refresh} />

      <OrderProgress order={order} />

      <OrderOverview
        order={order}
        money={
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
        }
      />

      <OrderLinesCard order={order} canManage={canManage} />

      <OrderRecords order={order} refresh={refresh} />
    </div>
  )
}
