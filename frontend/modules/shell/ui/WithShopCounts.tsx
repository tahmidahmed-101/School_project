"use client";

import type { ReactNode } from "react";
import { useCart } from "@/modules/cart";
import { WithPageKind } from "@/modules/catalog";
import { useWishlist } from "@/modules/wishlist";

interface ShopCounts {
  cart: number;
  wishlist: number;
}

/** Badge numbers for the shop the visitor is in: a pre-order page never counts stock items, and the other way round. */
export function WithShopCounts({ children }: { children: (counts: ShopCounts) => ReactNode }) {
  const { kind: basket, itemCountByKind } = useCart();
  const { countByKind } = useWishlist();
  return (
    <WithPageKind basket={basket}>
      {(kind) => children({ cart: itemCountByKind[kind], wishlist: countByKind[kind] })}
    </WithPageKind>
  );
}
