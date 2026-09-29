/**
 * Format a number into Bangladeshi Taka format (e.g. ৳1,450).
 */
export function taka(amount: number): string {
  const parts = Math.round(amount).toString().split(".");
  const intPart = parts[0] ?? "0";

  // Format with South Asian numbering system (e.g. 1,23,456)
  let lastThree = intPart.substring(intPart.length - 3);
  const otherNumbers = intPart.substring(0, intPart.length - 3);
  if (otherNumbers !== "") {
    lastThree = "," + lastThree;
  }
  const formatted = otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + lastThree;
  return `৳${formatted}`;
}
