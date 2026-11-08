import type { HeroSlidePlacement } from "@/features/system/types"

/** The storefront rows; one saved before the split may still be `both`, which the storefront also shows. */
export function onShop<T extends { placement: HeroSlidePlacement }>(rows: T[]): T[] {
  return rows.filter((row) => row.placement === "home" || row.placement === "both")
}
