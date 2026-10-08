import { Link } from "react-router-dom"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useCan } from "@/hooks/use-can"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { formatCount } from "../measure"
import type { PreorderSummary } from "../types"

export function PreorderSummaryCard({ summary, className }: { summary: PreorderSummary; className?: string }) {
  const canOpenOrders = useCan("orders.view")

  const tiles = [
    summary.open_orders !== undefined && {
      label: "Open pre-orders",
      value: formatCount(summary.open_orders),
      hint: "Not yet delivered",
    },
    summary.deposits_held !== undefined && {
      label: "Deposits held",
      value: formatCurrency(summary.deposits_held),
      hint: "Paid in advance for goods not yet delivered. Not sales.",
    },
    summary.balances_outstanding !== undefined && {
      label: "Balances to collect",
      value: formatCurrency(summary.balances_outstanding),
      hint: "Still owed on open pre-orders",
    },
  ].filter((tile) => tile !== false)

  if (tiles.length === 0) return null

  return (
    <Card className={cn("gap-0 py-0", className)}>
      <CardHeader className="flex flex-row items-start justify-between gap-3 border-b border-border px-5 py-4 [.border-b]:pb-4">
        <div className="min-w-0">
          <CardTitle level={2} className="text-base font-semibold">
            Pre-orders
          </CardTitle>
          <CardDescription className="mt-0.5 text-xs">Kept apart from stock sales.</CardDescription>
        </div>
        {canOpenOrders && (
          <Link to="/preorders" className="shrink-0 text-sm font-medium text-primary hover:underline">
            View pre-orders
          </Link>
        )}
      </CardHeader>
      <CardContent className="p-5">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {tiles.map((tile) => (
            <div key={tile.label} className="rounded-lg border border-border p-3">
              <dt className="text-xs text-muted-foreground">{tile.label}</dt>
              <dd className="mt-0.5 text-xl font-semibold tabular-nums">{tile.value}</dd>
              <dd className="text-xs text-muted-foreground">{tile.hint}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
