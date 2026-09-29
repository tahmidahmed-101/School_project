import type { MetadataRoute } from "next";
import { getCatalog } from "@/modules/catalog/server";
import { absoluteUrl } from "@/lib/site-url";

// Rebuilt from the API at most once an hour.
export const revalidate = 3600; // CACHE_LIFE.seoFeeds in lib/cache.ts

// No lastModified: the API exposes no per-product timestamps, and a made-up date is worse than none.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, categories } = await getCatalog();
  const paths = [
    "/",
    "/shop",
    "/pre-order",
    "/return-policy",
    "/refund-policy",
    ...categories.map((category) =>
      category.type === "preorder"
        ? `/shop?category=${category.slug}&type=preorder`
        : `/shop?category=${category.slug}`,
    ),
    ...products.map((product) => `/product/${product.slug}`),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
