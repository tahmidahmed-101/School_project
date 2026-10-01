import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { PackageCheck, Search } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { DataTable } from "@/components/common/data-table"
import { StatusBadge } from "@/components/common/StatusBadge"
import { useAppSelector } from "@/app/hooks"
import { hasPermission } from "@/app/modules"
import { formatCount } from "../measure"
import type { LowStockItem } from "../types"
import { WidgetError } from "./ReportWidget"

type Level = "critical" | "low"

// Same rule as the backend's low_stock_rollup: critical at or below half the reorder point.
function levelOf(item: LowStockItem): Level {
  return item.available <= Math.max(Math.floor(item.reorder_point / 2), 0) ? "critical" : "low"
}

interface Props {
  items: LowStockItem[] | null
  isLoading: boolean
  error: unknown
  onRetry: () => void
}

export function LowStockTable({ items, isLoading, error, onRetry }: Props) {
  const [query, setQuery] = useState("")
  const permissions = useAppSelector((state) => state.auth.user?.permissions)
  const canOpenInventory = hasPermission(permissions, "inventory.view")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...(items ?? [])]
      .filter((i) => !q || i.product_name.toLowerCase().includes(q) || i.variant_sku.toLowerCase().includes(q))
      .sort((a, b) => a.available - b.available || a.product_name.localeCompare(b.product_name))
  }, [items, query])

  const critical = useMemo(() => (items ?? []).filter((i) => levelOf(i) === "critical").length, [items])

  const columns: ColumnDef<LowStockItem>[] = useMemo(
    () => [
      {
        accessorKey: "product_name",
        header: "Product",
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium">{row.original.product_name}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.original.variant_sku}</p>
          </div>
        ),
      },
      {
        accessorKey: "quantity_on_hand",
        header: "On hand",
        cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.quantity_on_hand)}</span>,
      },
      {
        accessorKey: "quantity_reserved",
        header: "Reserved",
        cell: ({ row }) => (
          <span className="tabular-nums text-muted-foreground">{formatCount(row.original.quantity_reserved)}</span>
        ),
      },
      {
        accessorKey: "available",
        header: "Available",
        cell: ({ row }) => <span className="font-medium tabular-nums">{formatCount(row.original.available)}</span>,
      },
      {
        accessorKey: "reorder_point",
        header: "Reorder point",
        cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.reorder_point)}</span>,
      },
      {
        id: "level",
        header: "Level",
        cell: ({ row }) => {
          const level = levelOf(row.original)
          return <StatusBadge status={level} tone={level === "critical" ? "destructive" : "warning"} />
        },
      },
    ],
    []
  )

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">Low stock</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Stock records at or below their reorder point (live, not filtered by date)
            {items && items.length > 0 && (
              <>
                {" · "}
                {formatCount(items.length)} records, <span className="text-red-700 dark:text-red-500">{critical} critical</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search product or SKU"
              aria-label="Search low-stock items"
              className="h-9 w-56 pl-8"
            />
          </div>
          {canOpenInventory && (
            <Link to="/inventory" className="shrink-0 text-sm font-medium text-primary hover:underline">
              View stock
            </Link>
          )}
        </div>
      </div>
      {error ? (
        <WidgetError error={error} onRetry={onRetry} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          isLoading={isLoading}
          minWidth="640px"
          pageSize={10}
          emptyIcon={PackageCheck}
          emptyTitle={query ? "No matching items" : "Everything is stocked"}
          emptyDescription={
            query ? "No low-stock record matches your search." : "No stock record is at or below its reorder point."
          }
        />
      )}
    </Card>
  )
}
