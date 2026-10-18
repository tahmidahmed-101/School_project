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

// ৳1,23,45,678.50: lakh/crore grouping, the same digits as money.py group_lakh.
export function formatBdt(value: string | null | undefined): string {
  const paisa = toPaisa(value);
  const [whole, cents] = fromPaisa(paisa < BigInt(0) ? -paisa : paisa).split(".");
  const head = whole.slice(0, -3);
  return `${paisa < BigInt(0) ? "-" : ""}৳${head ? `${head.replace(/\B(?=(\d{2})+$)/g, ",")},` : ""}${whole.slice(-3)}.${cents}`;
}
