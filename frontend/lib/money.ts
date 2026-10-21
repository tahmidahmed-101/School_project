// Decimal strings, added in paisa (bigint), rounded half up once like money.py; non-ASCII-decimal text throws.
const MONEY_TEXT = /^\s*(-)?(\d+)(?:\.(\d*))?\s*$|^\s*(-)?\.(\d+)\s*$/;

export function toPaisa(value: string | null | undefined): bigint {
  if (value == null || value.trim() === "") return BigInt(0);
  const match = MONEY_TEXT.exec(value);
  if (!match) throw new Error(`not an amount: "${value}"`);
  const negative = match[1] ?? match[4];
  const fraction = (match[3] ?? match[5] ?? "").padEnd(3, "0");
  const paisa = BigInt(match[2] ?? "0") * BigInt(100) + BigInt(fraction.slice(0, 2)) + BigInt(fraction.charAt(2) >= "5" ? 1 : 0);
  return negative ? -paisa : paisa;
}

export function fromPaisa(paisa: bigint): string {
  const size = paisa < 0 ? -paisa : paisa;
  const text = `${size / BigInt(100)}.${String(size % BigInt(100)).padStart(2, "0")}`;
  return paisa < 0 ? `-${text}` : text;
}

export const sumMoney = (values: (string | null | undefined)[]): string =>
  fromPaisa(values.reduce((total, value) => total + toPaisa(value), BigInt(0)));
