import { buildProductFeed } from "@/modules/seo";
import { getCatalog } from "@/modules/catalog/server";

// Built from the live catalogue and refreshed at most once an hour.
export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

/** Google Merchant Center / Meta Catalog product feed, for Google Shopping and Facebook/Instagram shop ads. */
export async function GET(): Promise<Response> {
  const { products } = await getCatalog();
  return new Response(buildProductFeed(products), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
