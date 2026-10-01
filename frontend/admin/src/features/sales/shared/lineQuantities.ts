import type { OrderLine } from "@/features/sales/types"

/** Quantities typed per order line → the `lines` array the shipment/RMA endpoints expect. */
export function toLinePayload(quantities: Record<string, string>) {
  return Object.entries(quantities)
    .map(([order_line_id, raw]) => ({ order_line_id, quantity: Number(raw) }))
    .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0)
}

/** True when every typed quantity is a whole number within its line's bound and at least one is > 0. */
export function lineQuantitiesValid(
  lines: OrderLine[],
  values: Record<string, string>,
  maxFor: (line: OrderLine) => number
): boolean {
  let any = false
  for (const line of lines) {
    const raw = values[line.id]
    if (raw === undefined || raw === "") continue
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 0 || n > maxFor(line)) return false
    if (n > 0) any = true
  }
  return any
}
