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
          : "No arrived stock to hand out"
      )
      reload()
      onAllocated()
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Couldn't allocate arrived stock"))
    } finally {
      setAllocating(false)
    }
  }

  if (!report) return null
  const { summary, demand } = report

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1">
          <CardTitle>Pre-order book</CardTitle>
          <CardDescription>
            {summary.open_orders} open pre-order(s) worth {formatCurrency(summary.order_value)}. Received{" "}
            {formatCurrency(summary.deposits_held)}, still owed {formatCurrency(summary.balances_outstanding)}.
          </CardDescription>
        </div>
        {canManage && (
          <Button size="action" variant="outline" disabled={allocating} onClick={allocate}>
            Allocate arrived stock
          </Button>
        )}
      </CardHeader>
      {demand.length > 0 && (
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Product</th>
                <th className="py-1 text-right font-medium">Waiting</th>
                <th className="py-1 text-right font-medium">On shelf</th>
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
