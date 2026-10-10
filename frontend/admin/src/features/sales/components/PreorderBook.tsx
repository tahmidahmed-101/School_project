import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { api, getApiErrorMessage } from "@/lib/api/client"
import { unwrapItem } from "@/lib/api/envelope"
import { usePreorderReport } from "@/features/sales/hooks/usePreorderReport"
import { formatCurrency } from "@/lib/format"
import type { PreorderAllocationResult } from "@/features/sales/types"

/** The open pre-order book, with POST /admin/orders/preorder-allocation/ behind its button. */
export function PreorderBook({ canManage, onAllocated }: { canManage: boolean; onAllocated: () => void }) {
  const { report, reload } = usePreorderReport()
  const [allocating, setAllocating] = useState(false)

  const allocate = async () => {
    setAllocating(true)
    try {
      const res = await api.post("/admin/orders/preorder-allocation/")
      const { allocated } = unwrapItem<PreorderAllocationResult>(res.data)
      const units = allocated.reduce((sum, row) => sum + row.quantity, 0)
      toast.success(
        units > 0
          ? `${units} unit(s) set aside for ${new Set(allocated.map((row) => row.order_id)).size} order(s)`
          : "Nothing to set aside: no arrived units match a waiting order"
      )
      reload()
      onAllocated()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't set arrived goods aside"))
    } finally {
      setAllocating(false)
    }
  }

  if (!report) return null
  const { summary, demand } = report

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <CardTitle>Pre-order book</CardTitle>
          <CardDescription>
            {summary.open_orders} open pre-order(s) worth {formatCurrency(summary.order_value)}. Received{" "}
            {formatCurrency(summary.deposits_held)}, still owed {formatCurrency(summary.balances_outstanding)}.
          </CardDescription>
        </div>
        {canManage && (
          <Button
            size="action"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={allocating}
            onClick={allocate}
          >
            Set aside for orders
          </Button>
        )}
      </CardHeader>
      {demand.length > 0 && (
        <CardContent>
          {/* Four columns do not fit a phone: each product becomes its own block with labelled counts. */}
          <ul className="divide-y sm:hidden">
            {demand.map((row) => (
              <li key={row.variant_id} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium break-words">{row.product_name}</p>
                <p className="text-xs break-all text-muted-foreground">{row.variant_sku}</p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[11px] leading-tight text-muted-foreground">Waiting</dt>
                    <dd className="text-sm font-semibold">{row.waiting}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[11px] leading-tight text-muted-foreground">Arrived</dt>
                    <dd className="text-sm font-semibold">{row.available}</dd>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-2 py-1.5">
                    <dt className="text-[11px] leading-tight text-muted-foreground">To buy</dt>
                    <dd className="text-sm font-semibold">{row.to_buy}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-sm sm:table">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 text-right font-medium">Waiting</th>
                <th className="py-1 text-right font-medium">Arrived, not set aside</th>
                <th className="py-1 text-right font-medium">To buy</th>
              </tr>
            </thead>
            <tbody>
              {demand.map((row) => (
                <tr key={row.variant_id} className="border-t">
                  <td className="py-1.5">
                    {row.product_name} <span className="text-muted-foreground">({row.variant_sku})</span>
                  </td>
                  <td className="py-1.5 text-right">{row.waiting}</td>
                  <td className="py-1.5 text-right">{row.available}</td>
                  <td className="py-1.5 text-right font-medium">{row.to_buy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  )
}
