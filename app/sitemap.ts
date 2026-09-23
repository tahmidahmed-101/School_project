import type { MetadataRoute } from "next";
import { CATEGORIES, PRODUCTS } from "./lib/data";
import { absoluteUrl } from "./lib/site-url";

// No lastModified: the catalogue has no per-product timestamps, and a made-up date is worse than none.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    "/",
    "/shop",
    "/pre-order",
    "/return-policy",
    "/refund-policy",
    ...CATEGORIES.map((category) => `/shop?category=${category.slug}`),
    ...PRODUCTS.map((product) => `/product/${product.slug}`),
  ];
  return paths.map((path) => ({ url: absoluteUrl(path) }));
}
