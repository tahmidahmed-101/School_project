import type { CartItem } from "@/lib/types";

/** What the server cart should hold for one SKU. */
export interface CartTarget {
  variantId: string;
  quantity: number;
}

/** A line the server cart holds now. */
export interface ServerCartLine {
  id: string;
  variantId: string;
  quantity: number;
}

export type CartSyncOp =
  | { type: "add"; variantId: string; quantity: number }
  | { type: "update"; lineId: string; quantity: number }
  | { type: "remove"; lineId: string };

/** The browser cart as server-cart targets: one entry per SKU. Prices are never sent; the backend prices each line. */
export function toCartTargets(items: CartItem[]): CartTarget[] {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.variantId, (quantities.get(item.variantId) ?? 0) + item.quantity);
  }
  return [...quantities].map(([variantId, quantity]) => ({ variantId, quantity }));
}

/** The calls that turn the server cart's `lines` into `target`. Empty when they already match. */
export function planCartSync(target: CartTarget[], lines: ServerCartLine[]): CartSyncOp[] {
  const wanted = new Map(target.map((t) => [t.variantId, t.quantity]));
  const ops: CartSyncOp[] = [];
  const held = new Set<string>();

  for (const line of lines) {
    const quantity = wanted.get(line.variantId);
    // The backend keeps one line per SKU; a second one for the same SKU is never wanted.
    if (quantity === undefined || held.has(line.variantId)) {
      ops.push({ type: "remove", lineId: line.id });
      continue;
    }
    held.add(line.variantId);
    if (quantity !== line.quantity) ops.push({ type: "update", lineId: line.id, quantity });
  }
  for (const { variantId, quantity } of target) {
    if (!held.has(variantId)) ops.push({ type: "add", variantId, quantity });
  }
  return ops;
}
