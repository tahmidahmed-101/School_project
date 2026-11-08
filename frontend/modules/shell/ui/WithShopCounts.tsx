"use client";

import type { ReactNode } from "react";
import { useCart } from "@/modules/cart";
import { useWishlist } from "@/modules/wishlist";

interface ShopCounts {
  cart: number;
  wishlist: number;
}

/** Badge numbers for the cart and wishlist icons. */
export function WithShopCounts({ children }: { children: (counts: ShopCounts) => ReactNode }) {
  const { totalItems } = useCart();
  const { items } = useWishlist();
  return <>{children({ cart: totalItems, wishlist: items.length })}</>;
}
