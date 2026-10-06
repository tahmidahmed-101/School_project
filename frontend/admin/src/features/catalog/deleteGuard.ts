// Product deletion is refused while stock remains (apps/catalog/services/products.py
// _ensure_no_stock). Kept free of React and "@/" imports so `node --test` can load it
// (tests/unit/deleteGuard.test.ts).

/** The backend error code for "this product still has stock or reservations". */
export const PRODUCT_STOCK_IN_USE = "product_stock_in_use"

/** True when a failed delete was refused because stock or reservations remain. */
export function isBlockedByStock(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === PRODUCT_STOCK_IN_USE
}

/** Stock Levels filtered to this product, where the existing write-off dialog lives. */
export function stockLevelsPath(productName: string): string {
  return `/inventory?search=${encodeURIComponent(productName)}`
}
