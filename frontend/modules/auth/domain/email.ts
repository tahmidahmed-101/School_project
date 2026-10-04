/** Mail providers customers actually use; a domain one or two slips away from one of these is almost always a typo. */
const COMMON_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "live.com"];

/** Edit distance where swapping two neighbouring letters ("gamil") counts as one slip, like a dropped one ("gmai"). */
function distance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) rows[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}

/**
 * The address the customer probably meant when its domain is a near miss of a common provider
 * ("me@gamil.com" -> "me@gmail.com"), or null when the address looks fine. An account registered under a
 * misspelled address cannot be logged into with the correct one, so the register form asks before creating it.
 */
export function suggestEmailCorrection(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email
    .slice(at + 1)
    .trim()
    .toLowerCase();
  if (!domain || COMMON_DOMAINS.includes(domain)) return null;
  const match = COMMON_DOMAINS.find(
    (known) => distance(domain, known) <= 2 && Math.abs(domain.length - known.length) <= 2,
  );
  return match ? `${local}@${match}` : null;
}
