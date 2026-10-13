// Money travels as a decimal string and is added in whole paisa (bigint); never a JS number.
const MONEY_TEXT = /^\s*(-)?(\d*)(?:\.(\d{0,2})\d*)?\s*$/;

export function toPaisa(value: string | null | undefined): bigint {
  const match = MONEY_TEXT.exec(value ?? "");
  if (!match) return BigInt(0);
  const paisa = BigInt(match[2] || "0") * BigInt(100) + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] ? -paisa : paisa;
}

export function fromPaisa(paisa: bigint): string {
  const size = paisa < 0 ? -paisa : paisa;
  const text = `${size / BigInt(100)}.${String(size % BigInt(100)).padStart(2, "0")}`;
  return paisa < 0 ? `-${text}` : text;
}

export const sumMoney = (values: (string | null | undefined)[]): string =>
  fromPaisa(values.reduce((total, value) => total + toPaisa(value), BigInt(0)));

const COST_TEXT = /^\s*(\d*)(?:\.(\d{0,4})\d*)?\s*$/;

/**
 * Total of `unitCost x quantity` lines, where a unit cost has up to four decimals and a quantity is a whole number.
 * Summed in ten-thousandths and rounded half up to paisa once, the way the API totals a purchase order.
 */
export function sumCostLines(lines: { unitCost: string | null | undefined; quantity: number }[]): string {
  let total = BigInt(0);
  for (const { unitCost, quantity } of lines) {
    const match = COST_TEXT.exec(unitCost ?? "");
    if (!match || !Number.isInteger(quantity) || quantity <= 0) continue;
    const cost = BigInt(match[1] || "0") * BigInt(10000) + BigInt((match[2] ?? "").padEnd(4, "0"));
    total += cost * BigInt(quantity);
  }
  return fromPaisa((total + BigInt(50)) / BigInt(100));
}

/** A typed amount: digits with up to two decimals, no sign. */
export const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/;
