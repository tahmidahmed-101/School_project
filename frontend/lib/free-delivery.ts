import { fromPaisa, toPaisa } from "@/lib/money";
import { productKind } from "@/lib/product";
import type { CartItem } from "@/lib/types";

const ZERO = BigInt(0);
const TAKA = BigInt(100);

export type FreeDeliveryStatus = { reached: true } | { reached: false; remaining: string };

export function basketSubtotal(items: CartItem[]): string {
  return fromPaisa(
    items.reduce((total, item) => total + toPaisa(String(item.product.price)) * BigInt(item.quantity), ZERO),
  );
}

/** Null when the offer is off or the basket is not a stock one (empty, pre-order or mixed). */
export function freeDeliveryStatus(minAmount: string | null | undefined, items: CartItem[]): FreeDeliveryStatus | null {
  const threshold = toPaisa(minAmount);
  const allStock = items.length > 0 && items.every((item) => productKind(item.product) === "stock");
  if (threshold <= ZERO || !allStock) return null;
  const short = threshold - toPaisa(basketSubtotal(items));
  if (short <= ZERO) return { reached: true };
  // Amounts show in whole taka, so the gap rounds up: spending what the line says always reaches the threshold.
  return { reached: false, remaining: fromPaisa(((short + TAKA - BigInt(1)) / TAKA) * TAKA) };
}
