import { getCatalog } from "@/modules/catalog/server";
import { ogCardResponse } from "@/modules/seo/server";

export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

/** 1200x630 share image for a category page. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const { categories, failed } = await getCatalog();
  if (failed) return new Response("Catalogue unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  const category = categories.find((c) => c.slug === slug);
  if (!category) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return ogCardResponse(category.image);
}
