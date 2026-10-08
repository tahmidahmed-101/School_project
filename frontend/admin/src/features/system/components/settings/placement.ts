import type { HeroSlidePlacement, ShopPlacement } from "@/features/system/types"

/** A row saved before the split may still be `both`; the storefront shows it on each shop, so each page lists it. */
export function onShop<T extends { placement: HeroSlidePlacement }>(rows: T[], placement: ShopPlacement): T[] {
  return rows.filter((row) => row.placement === placement || row.placement === "both")
}
