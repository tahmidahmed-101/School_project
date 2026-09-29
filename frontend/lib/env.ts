/**
 * Validated public (NEXT_PUBLIC_*) configuration. These values are inlined into the client bundle, so each one
 * must be read as a literal `process.env.NEXT_PUBLIC_X` (a dynamic lookup would not be replaced at build time).
 * Never put a secret here: secrets go in lib/env.server.ts.
 *
 * A malformed value throws with a message naming the variable, so a typo fails the build instead of quietly
 * shipping broken canonicals or a dead tracking pixel. An unset optional value is simply `undefined`.
 */

function optional(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  return value ? value : undefined;
}

function matching(name: string, raw: string | undefined, pattern: RegExp, hint: string): string | undefined {
  const value = optional(raw);
  if (value !== undefined && !pattern.test(value)) {
    throw new Error(`Invalid ${name}: expected ${hint}.`);
  }
  return value;
}

function origin(name: string, raw: string | undefined): string | undefined {
  const value = optional(raw);
  if (value === undefined) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute URL such as https://example.com.`);
  }
}

/** Absolute URL without trailing slashes (path kept), for API base URLs. */
function baseUrl(name: string, raw: string | undefined): string | undefined {
  const value = optional(raw);
  if (value === undefined) return undefined;
  try {
    new URL(value);
  } catch {
    throw new Error(`Invalid ${name}: expected an absolute URL such as http://127.0.0.1:8000/api/v1/public.`);
  }
  return value.replace(/\/+$/, "");
}

export const publicEnv = {
  /** Public origin of the site (no trailing slash); drives canonicals, the sitemap and structured data. */
  siteUrl: origin("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL),
  /** LaunchCart public API base URL. next.config.mjs inlines its default, so this is set in every build. */
  apiUrl: baseUrl("NEXT_PUBLIC_API_URL", process.env.NEXT_PUBLIC_API_URL),
  googleSiteVerification: optional(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION),
  fbDomainVerification: optional(process.env.NEXT_PUBLIC_FB_DOMAIN_VERIFICATION),
  gaId: matching("NEXT_PUBLIC_GA_ID", process.env.NEXT_PUBLIC_GA_ID, /^G-[A-Z0-9]+$/, "a GA4 ID like G-XXXXXXXXXX"),
  fbPixelId: matching("NEXT_PUBLIC_FB_PIXEL_ID", process.env.NEXT_PUBLIC_FB_PIXEL_ID, /^\d+$/, "a numeric pixel ID"),
  tiktokPixelId: matching(
    "NEXT_PUBLIC_TIKTOK_PIXEL_ID",
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID,
    /^[A-Z0-9]+$/,
    "an alphanumeric pixel ID",
  ),
} as const;
