/** Numeric strings from the API (DRF serialises decimals as strings) to numbers; anything unusable becomes 0. */
export const toNumber = (value: string | null | undefined): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
