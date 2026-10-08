import { TextCell } from "@/components/common/cells"

import type { ProductVariant } from "../types"

export function VariantOptionsCell({ variant }: { variant: ProductVariant }) {
  return <TextCell value={[variant.color, variant.size].filter(Boolean).join(" / ")} />
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
