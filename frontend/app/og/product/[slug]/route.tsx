import { getProductBySlug } from "@/modules/catalog/server";
import { failure, ogCardResponse } from "@/modules/seo/server";

/** 1200x630 share image for a product page. An API failure other than "not found" is thrown, so it is a 500, not a 404. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return failure(404, "Not found");
  return ogCardResponse(product.image);
}
