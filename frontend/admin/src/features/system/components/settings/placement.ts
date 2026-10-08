import type { HeroSlidePlacement, ShopPlacement } from "@/features/system/types"

/** Same rule as the storefront: a page shows its own rows and the ones placed on both. */
export function onShop<T extends { placement: HeroSlidePlacement }>(rows: T[], placement: ShopPlacement): T[] {
  return rows.filter((row) => row.placement === placement || row.placement === "both")
}

export const SHARED_EDIT_NOTE = "This one is also on the other shop. Saving it here keeps it on this shop only."
