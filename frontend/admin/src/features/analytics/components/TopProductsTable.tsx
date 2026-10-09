import type { ColumnDef } from "@tanstack/react-table"
import { PackageOpen } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { DataTable } from "@/components/common/data-table"
import type { Kind } from "@/hooks/use-kind"
import { formatCurrency } from "@/lib/format"
import { cn } from "@/lib/utils"
import { formatCount } from "../measure"
import type { TopProduct } from "../types"
import { ReportWidget } from "./ReportWidget"
import { Sparkline } from "./Sparkline"

const COPY = {
  stock: {
    title: "Top stock products",
    description: "Best-selling stock items by units in this period",
    link: { to: "/products", label: "Catalog" },
    emptyTitle: "No products sold",
    emptyDescription: "Best sellers show up here once orders are paid in this period.",
  },
  preorder: {
    title: "Top pre-order products",
    description: "Most pre-ordered items by units in this period",
    link: { to: "/preorder_products", label: "Products" },
    emptyTitle: "No pre-orders in this period",
    emptyDescription: "The most pre-ordered items show up here once pre-orders come in.",
  },
} satisfies Record<Kind, object>

interface Props {
  kind: Kind
  products: TopProduct[] | undefined
  isLoading: boolean
  error: unknown
  onRetry: () => void
  className?: string
}

export function TopProductsTable({ kind, products, isLoading, error, onRetry, className }: Props) {
  const copy = COPY[kind]
  const allColumns: ColumnDef<TopProduct>[] = [
    {
      id: "rank",
      header: "#",
      cell: ({ row }) => <span className="tabular-nums text-muted-foreground">{row.original.rank}</span>,
    },
    {
      id: "product",
      header: "Product",
      cell: ({ row: { original: p } }) => (
        <div className="min-w-0">
          <p className="truncate font-medium" title={p.name}>
            {p.name}
          </p>
          <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>
        </div>
      ),
    },
    {
      id: "units",
      header: "Units",
      meta: { align: "right" },
      cell: ({ row }) => <span className="tabular-nums">{formatCount(row.original.units)}</span>,
    },
    {
      id: "revenue",
      header: "Revenue",
      meta: { align: "right" },
      cell: ({ row }) => <span className="font-medium tabular-nums">{formatCurrency(row.original.revenue)}</span>,
    },
    {
      id: "available",
      header: "Available",
      meta: { align: "right" },
      cell: ({ row }) => (
        <span
          className={cn("tabular-nums", row.original.stock <= 0 && "font-medium text-red-700 dark:text-red-500")}
        >
          {formatCount(row.original.stock)}
        </span>
      ),
    },
    {
      id: "daily",
      header: "Daily units",
      cell: ({ row }) => <Sparkline values={row.original.spark} className="h-8" />,
    },
  ]
  // "Available" is shop stock on the shelf; a pre-order item is bought to order.
  const columns = kind === "preorder" ? allColumns.filter((column) => column.id !== "available") : allColumns

  return (
    <ReportWidget
      title={copy.title}
      description={copy.description}
      link={copy.link}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={!products?.length}
      emptyIcon={PackageOpen}
      emptyTitle={copy.emptyTitle}
      emptyDescription={copy.emptyDescription}
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
      <DataTable
        embedded
        showPagination={false}
        columns={columns}
        data={products ?? []}
        minWidth={kind === "preorder" ? "480px" : "560px"}
        columnWidths={
          kind === "preorder"
            ? ["48px", "240px", "90px", "120px", "112px"]
            : ["48px", "240px", "90px", "120px", "100px", "112px"]
        }
      />
    </ReportWidget>
  )
}
