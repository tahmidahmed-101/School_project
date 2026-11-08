import type { MetadataRoute } from "next";
import { getCatalog } from "@/modules/catalog/server";
import { isPolicyPublished } from "@/modules/policies/server";
import { absoluteUrl } from "@/lib/site-url";

// Rebuilt from the API at most once an hour.
export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

// No lastModified: the API exposes no per-product timestamps, and a made-up date is worse than none.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ products, categories }, hasShippingPolicy] = await Promise.all([
    getCatalog(),
    isPolicyPublished("shipping"),
  ]);
  const paths = [
    "/",
    "/shop",
    "/return-policy",
    "/refund-policy",
    ...(hasShippingPolicy ? ["/shipping-policy"] : []),
    ...categories.map((category) => `/shop?category=${category.slug}`),
    ...products.map((product) => `/product/${product.slug}`),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
