/**
 * Every cache tag and lifetime the storefront uses, in one place.
 *
 * Route-segment exports (`export const revalidate = 3600` in sitemap.ts and the route handlers) must be literal
 * numbers Next can read statically, so they cannot import from here; each one carries a comment pointing at the
 * matching entry below. Keep them in step when changing a value.
 *
 * Pages are dynamic (layout.tsx). The lifetimes below are how long lib/api/edge-cache.ts keeps an API answer on the
 * Worker; POST /api/revalidate cannot purge that cache, so a change shows once the lifetime runs out.
 */

/** Tags passed to fetch(..., { next: { tags } }); invalidated by POST /api/revalidate. */
export const CACHE_TAGS = {
  catalog: "catalog",
  business: "business",
  storefrontContent: "storefront-content",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Seconds. */
export const CACHE_LIFE = {
  /** Categories, products, reviews. */
  catalog: 60,
  /** Business profile (contact details). */
  business: 300,
  /** Return and refund policies published in the dashboard. */
  policies: 300,
  /** Enabled payment methods. */
  paymentMethods: 300,
  /** Coupons advertised in the voucher strip. */
  vouchers: 60,
  /** Hero slides and promo strip lines managed in the dashboard. */
  storefrontContent: 60,
  /** /api/search-index (`revalidate = 300`). */
  searchIndex: 300,
  /** sitemap.xml, llms.txt, products.xml (`revalidate = 3600`). */
  seoFeeds: 3600,
} as const;
