import { fromPaisa } from "./money.ts"

const COST_TEXT = /^\s*(\d*)(?:\.(\d{0,4})\d*)?\s*$/

/**
 * Total of `unitCost x quantity` lines, where a unit cost has up to four decimals and a quantity is a whole number.
 * Summed in ten-thousandths and rounded half up to paisa once, the way the API totals a purchase order.
 */
export function sumCostLines(lines: { unitCost: string | null | undefined; quantity: number }[]): string {
  let total = BigInt(0)
  for (const { unitCost, quantity } of lines) {
    const match = COST_TEXT.exec(unitCost ?? "")
    if (!match || !Number.isInteger(quantity) || quantity <= 0) continue
    const cost = BigInt(match[1] || "0") * BigInt(10000) + BigInt((match[2] ?? "").padEnd(4, "0"))
    total += cost * BigInt(quantity)
  }
  return fromPaisa((total + BigInt(50)) / BigInt(100))
}
