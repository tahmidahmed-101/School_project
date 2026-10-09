"use client";

import dynamic from "next/dynamic";
import { useLazyMount } from "@/design-system/patterns/useLazyMount";
import { useCart } from "../context";

const CartDrawer = dynamic(() => import("./CartDrawer").then((m) => m.CartDrawer), { ssr: false });

/** The cart drawer as its own chunk, kept out of the first load (see useLazyMount). */
export function LazyCartDrawer({ freeDeliveryMinAmount }: { freeDeliveryMinAmount?: string | null }) {
  const { isDrawerOpen } = useCart();
  return useLazyMount(isDrawerOpen) ? <CartDrawer freeDeliveryMinAmount={freeDeliveryMinAmount} /> : null;
}
