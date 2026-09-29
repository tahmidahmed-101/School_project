import { buildLlmsTxt } from "@/modules/seo";
import { getCatalog } from "@/modules/catalog/server";
import { getBrand } from "@/modules/business/server";

// Built from the live catalogue and refreshed at most once an hour.
export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

/** Plain-text catalogue summary for AI crawlers, per the llms.txt convention. */
export async function GET(): Promise<Response> {
  const [catalog, brand] = await Promise.all([getCatalog(), getBrand()]);
  return new Response(buildLlmsTxt(catalog, brand), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
