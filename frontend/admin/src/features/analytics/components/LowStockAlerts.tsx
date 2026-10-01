import { PackageCheck } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
import { formatCount } from "../measure"
import type { InventoryAlert, LowStockCounts } from "../types"
import { ReportWidget } from "./ReportWidget"

interface Props {
  items: InventoryAlert[] | undefined
  counts: LowStockCounts | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function LowStockAlerts({ items, counts, isLoading, error, onRetry, className }: Props) {
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  const canOpenInventory = hasPermission(permissions, "inventory.view")
  const total = counts?.total ?? 0

  return (
    <ReportWidget
      title="Low stock"
      description="Variants at or below their reorder point (current snapshot)"
      link={canOpenInventory ? { to: "/inventory", label: "View stock" } : undefined}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={total === 0}
      emptyIcon={PackageCheck}
      emptyTitle="Everything is stocked"
      emptyDescription="No variant is below its reorder point."
      skeleton={
        <div className="flex flex-col gap-3">
          <Skeleton className="h-14 w-full" />
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      }
      className={className}
    >
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Low stock</p>
          <p className="text-xl font-semibold tabular-nums">{formatCount(total)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-xs text-red-700 dark:text-red-400">Critical</p>
          <p className="text-xl font-semibold tabular-nums text-red-700 dark:text-red-400">
            {formatCount(counts?.critical ?? 0)}
          </p>
        </div>
      </div>
      <ul className="divide-y divide-border">
        {items?.map((item) => (
          <li key={item.sku} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={item.name}>
                {item.name}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{item.sku}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                <span className="text-sm font-medium text-foreground">{formatCount(item.stock)}</span> /{" "}
                {formatCount(item.reorder)}
              </span>
              <StatusBadge
                status={item.level}
                tone={item.level === "critical" ? "destructive" : "warning"}
              />
            </div>
          </li>
        ))}
      </ul>
      {items && total > items.length && (
        <p className="mt-2 text-xs text-muted-foreground">
          Showing {items.length} of {formatCount(total)} lowest-stock variants.
        </p>
      )}
    </ReportWidget>
  )
}
