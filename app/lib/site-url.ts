const production = process.env.NODE_ENV === "production";

/** Public origin of the site, e.g. https://kullmart.com (no trailing slash). Set NEXT_PUBLIC_SITE_URL at build time. */
function readConfiguredUrl(): string {
  // Literal process.env access so Next inlines it into client bundles too.
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

const configured = readConfiguredUrl();

// Never guess a production host: without one, canonicals, the sitemap and structured data stay relative.
if (!configured && production && typeof window === "undefined") {
  console.warn("NEXT_PUBLIC_SITE_URL is not set: canonical URLs, the sitemap and structured data will be relative.");
}

export const SITE_URL = configured || (production ? "" : "http://localhost:3002");

/** Absolute URL for a site path such as "/shop" (relative when no site URL is configured). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
