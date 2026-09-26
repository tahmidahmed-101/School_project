import { buildProductFeed } from "../lib/product-feed";
import { getCatalog } from "../lib/site-data";

// Built from the live catalogue and refreshed at most once an hour.
export const revalidate = 3600;

/** Google Merchant Center / Meta Catalog product feed, for Google Shopping and Facebook/Instagram shop ads. */
export async function GET(): Promise<Response> {
  const { products } = await getCatalog();
  return new Response(buildProductFeed(products), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
