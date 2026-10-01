import { PackageOpen } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { formatCount } from "../measure"
import type { TopProduct } from "../types"
import { ReportWidget } from "./ReportWidget"
import { Sparkline } from "./Sparkline"

interface Props {
  products: TopProduct[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function TopProductsTable({ products, isLoading, error, onRetry, className }: Props) {
  return (
    <ReportWidget
      title="Top products"
      description="Best sellers by units in this period"
      link={{ to: "/products", label: "Catalog" }}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={!products?.length}
      emptyIcon={PackageOpen}
      emptyTitle="No products sold"
      emptyDescription="Best sellers show up here once orders are paid in this period."
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
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 pl-5">#</TableHead>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="w-28 pr-5">Daily units</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products?.map((p) => (
              <TableRow key={p.sku}>
                <TableCell className="pl-5 text-muted-foreground tabular-nums">{p.rank}</TableCell>
                <TableCell>
                  <p className="max-w-[220px] truncate font-medium" title={p.name}>
                    {p.name}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatCount(p.units)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatCurrency(p.revenue)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    p.stock <= 0 && "font-medium text-red-700 dark:text-red-500"
                  )}
                >
                  {formatCount(p.stock)}
                </TableCell>
                <TableCell className="pr-5">
                  <Sparkline values={p.spark} className="h-8" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ReportWidget>
  )
}
