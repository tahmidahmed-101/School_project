import "server-only";
import { cache } from "react";
import { getProduct, getProductReviews, listAllProducts, listCategories } from "./queries";
import { ApiError } from "@/lib/api/client";
import { toCategoryInfo, toProduct, withReviewSummary } from "./adapters";
import type { CategoryInfo, Product } from "@/lib/types";

/**
 * Server-side data access for pages, layouts and SEO routes. Everything here reads the LaunchCart API through
 * the API layer and hands back storefront models. Import from server code only.
 * `cache()` de-duplicates within one render; the fetch cache (revalidate) shares results across requests.
 */

export interface Catalog {
  products: Product[];
  categories: CategoryInfo[];
  /** True when the API could not be reached, so an empty catalogue means "unavailable", not "no products". */
  failed: boolean;
}

export const getCatalog = cache(async (): Promise<Catalog> => {
  try {
    const [apiCategories, apiProducts] = await Promise.all([listCategories(), listAllProducts()]);
    const products = apiProducts.map((p) => toProduct(p, apiCategories));
    const categories = apiCategories.map((c) => toCategoryInfo(c, products));
    return { products, categories, failed: false };
  } catch (error) {
    console.error("[catalog] LaunchCart API unavailable:", error instanceof Error ? error.message : error);
    // A running production server that cannot reach the API must not replace a good page with an empty one:
    // throwing makes Next keep serving the last successfully generated page until the API is back.
    // At build time (and in dev) an unreachable API instead yields an explicit "unavailable" catalogue.
    const isRuntime = process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build";
    if (isRuntime) throw error;
    return { products: [], categories: [], failed: true };
  }
});

/**
 * One product with its full description and review summary, or null when the slug does not exist (404).
 * Any other failure (network, 5xx) is thrown so the route's error boundary shows a retry instead of a false 404.
 */
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  try {
    const [product, categories] = await Promise.all([getProduct(slug), listCategories()]);
    const base = toProduct(product, categories);
    try {
      // A review summary is optional decoration: failing to load it must not break the page.
      return withReviewSummary(base, await getProductReviews(slug, { page_size: 1 }));
    } catch {
      return base;
    }
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
});
