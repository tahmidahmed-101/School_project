"use client";

import dynamic from "next/dynamic";
import { useLazyMount } from "@/design-system/patterns/useLazyMount";
import { useWishlist } from "../context";

const WishlistDrawer = dynamic(() => import("./WishlistDrawer").then((m) => m.WishlistDrawer), { ssr: false });

/** The wishlist drawer as its own chunk, kept out of the first load (see useLazyMount). */
export function LazyWishlistDrawer() {
  const { isWishlistOpen } = useWishlist();
  return useLazyMount(isWishlistOpen) ? <WishlistDrawer /> : null;
}
