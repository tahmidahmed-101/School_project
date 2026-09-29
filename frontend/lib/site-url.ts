import { publicEnv } from "@/lib/env";

const production = process.env.NODE_ENV === "production";
const configured = publicEnv.siteUrl ?? "";

// Never guess a production host: without one, canonicals, the sitemap and structured data stay relative.
if (!configured && production && typeof window === "undefined") {
  console.warn("NEXT_PUBLIC_SITE_URL is not set: canonical URLs, the sitemap and structured data will be relative.");
}

export const SITE_URL = configured || (production ? "" : "http://localhost:3002");

/** Absolute URL for a site path such as "/shop" (relative when no site URL is configured). */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
