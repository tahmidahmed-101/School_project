// Product deletion is refused while stock remains (apps/catalog/services/products.py
// _ensure_no_stock). Kept free of React and "@/" imports so `node --test` can load it
// (tests/unit/deleteGuard.test.ts).

/** The backend error code for "this product still has stock or reservations". */
export const PRODUCT_STOCK_IN_USE = "product_stock_in_use"

/** True when a failed delete was refused because stock or reservations remain. */
export function isBlockedByStock(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: unknown }).code === PRODUCT_STOCK_IN_USE
}

export interface StockQuantities {
  quantity_on_hand: number
  quantity_reserved: number
}

/** A product's stock summed over its variants and warehouses. */
export function stockTotals(rows: StockQuantities[]) {
  const onHand = rows.reduce((sum, row) => sum + row.quantity_on_hand, 0)
  const reserved = rows.reduce((sum, row) => sum + row.quantity_reserved, 0)
  return { onHand, reserved, available: onHand - reserved }
}

/** The same rule the backend enforces: nothing on hand, nothing reserved, no active reservation. */
export function isDeletable(rows: StockQuantities[], activeReservations: number): boolean {
  const { onHand, reserved } = stockTotals(rows)
  return onHand === 0 && reserved === 0 && activeReservations === 0
}
