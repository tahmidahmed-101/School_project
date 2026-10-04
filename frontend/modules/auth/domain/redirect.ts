/**
 * Where to send the customer after logging in: the `?next=` path when it is a path on this site, otherwise home.
 * Anything that could leave the site (absolute URLs, protocol-relative "//host", backslash tricks) is ignored.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return fallback;
  return next;
}

/** Login link that returns to `path` afterwards. */
export function loginHref(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/** "Jane Mary Doe" -> first "Jane", last "Mary Doe"; the API stores the two parts separately. */
export function splitFullName(fullName: string): { first_name: string; last_name: string } {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  return { first_name: first, last_name: rest.join(" ") };
}
