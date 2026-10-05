/**
 * Every cache tag and lifetime the storefront uses, in one place.
 *
 * Route-segment exports (`export const revalidate = 60` in layout.tsx, sitemap.ts and the route handlers) must be
 * literal numbers Next can read statically, so they cannot import from here; each one carries a comment pointing
 * at the matching entry below. Keep them in step when changing a value.
 */

/** Tags passed to fetch(..., { next: { tags } }); invalidated by POST /api/revalidate. */
export const CACHE_TAGS = {
  catalog: "catalog",
  business: "business",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

/** Seconds. */
export const CACHE_LIFE = {
  /** Categories, products, reviews. Also layout.tsx (`revalidate = 60`). */
  catalog: 60,
  /** Business profile (contact details). */
  business: 300,
  /** Enabled payment methods. */
  paymentMethods: 300,
  /** Coupons advertised in the voucher strip. */
  vouchers: 60,
  /** /api/search-index (`revalidate = 300`). */
  searchIndex: 300,
  /** sitemap.xml, llms.txt, products.xml (`revalidate = 3600`). */
  seoFeeds: 3600,
} as const;
