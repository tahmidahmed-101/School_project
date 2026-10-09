import { TextCell } from "@/components/common/cells"
import { formatDate } from "@/lib/format"

import type { ProductVariant } from "../types"

export function VariantOptionsCell({ variant }: { variant: ProductVariant }) {
  return <TextCell value={variant.title} />
}

export function VariantStockCell({ variant, showLow = false }: { variant: ProductVariant; showLow?: boolean }) {
  return (
    <span
      className={
        variant.stock <= 0
          ? "text-sm font-medium text-destructive"
          : variant.is_low_stock
            ? "text-sm font-medium text-amber-600 dark:text-amber-400"
            : "text-sm"
      }
    >
      {variant.stock}
      {showLow && variant.is_low_stock && variant.stock > 0 && " (low)"}
    </span>
  )
}

/** Pre-order variants: whether customers can order now, and the day ordering closes. */
export function VariantOrderingCell({ variant }: { variant: ProductVariant }) {
  return (
    <div className="flex flex-col text-sm">
      <span>{variant.is_preorder_active ? "Open" : "Closed"}</span>
      <span className="text-xs text-muted-foreground">
        {variant.preorder_end_date ? `Until ${formatDate(variant.preorder_end_date)}` : "No dates set"}
      </span>
    </div>
  )
}
