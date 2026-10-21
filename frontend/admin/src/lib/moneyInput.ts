import { fromPaisa, toPaisa } from "./money.ts"

/** A typed amount: digits with up to two decimals, no sign. */
export const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/

/** Paisa of a typed amount: blank is 0, text that is not an amount is null (the field shows its error), never a throw. */
export function parseAmount(text: string | null | undefined): bigint | null {
  const value = (text ?? "").trim()
  if (value === "") return BigInt(0)
  return AMOUNT_PATTERN.test(value) ? toPaisa(value) : null
}

/** Sum of typed amounts for a live total; a line that is not an amount counts as 0 while its field shows the error. */
export const sumTyped = (values: (string | null | undefined)[]): string =>
  fromPaisa(values.reduce<bigint>((total, value) => total + (parseAmount(value) ?? BigInt(0)), BigInt(0)))
