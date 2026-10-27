import { getShellCatalog } from "@/modules/catalog/server";
import { failure, ogCardResponse } from "@/modules/seo/server";

/** 1200x630 share image for a category page. A catalogue failure is thrown, so it is a 500, not a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const { categories, failed } = await getShellCatalog();
  if (failed) throw new Error("Catalogue unavailable");
  const category = categories.find((c) => c.slug === slug);
  if (!category) return failure(404, "Not found");
  return ogCardResponse(category.image);
}
