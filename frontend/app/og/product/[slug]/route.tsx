import { getProductBySlug } from "@/modules/catalog/server";
import { ogCardResponse } from "@/modules/seo/server";

export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

/** 1200x630 share image for a product page. An API failure other than "not found" is thrown, so it is a 500, not a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return ogCardResponse(product.image);
}
