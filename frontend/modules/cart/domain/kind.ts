import { productKind, splitByKind, type ProductKind } from "@/lib/product";
import type { CartItem, Product } from "@/lib/types";

const lineKind = (item: CartItem): ProductKind => productKind(item.product);

/** The one shop a basket belongs to; null when empty, "mixed" only for a basket saved before the rule existed. */
export function basketKind(items: CartItem[]): ProductKind | "mixed" | null {
  const kinds = new Set(items.map(lineKind));
  if (kinds.size === 0) return null;
  if (kinds.size > 1) return "mixed";
  return [...kinds][0]!;
}

export function acceptsProduct(items: CartItem[], product: Product): boolean {
  const kind = basketKind(items);
  return kind === null || kind === productKind(product);
}

export interface BasketGroup {
  kind: ProductKind;
  items: CartItem[];
  totalItems: number;
  subtotal: number;
}

export function basketGroups(items: CartItem[]): BasketGroup[] {
  const byKind = splitByKind(items, lineKind);
  return (["stock", "preorder"] as const)
    .filter((kind) => byKind[kind].length > 0)
    .map((kind) => ({
      kind,
      items: byKind[kind],
      totalItems: byKind[kind].reduce((sum, item) => sum + item.quantity, 0),
      subtotal: byKind[kind].reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    }));
}
