import { toSearchEntry } from "@/lib/product";
import { getCatalog } from "@/modules/catalog/server";

// Literal on purpose (see lib/cache.ts): CACHE_LIFE.searchIndex.
export const revalidate = 300;

/**
 * Slim product list for the header search. Loaded by the browser on first focus of the search box, so the full
 * catalogue never has to ride along in every page's HTML.
 */
export async function GET(): Promise<Response> {
  const { products } = await getCatalog();
  return Response.json(products.map(toSearchEntry), {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
