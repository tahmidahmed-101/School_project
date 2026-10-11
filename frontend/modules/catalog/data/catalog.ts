import "server-only";
import { cache } from "react";
import { getProduct, getProductReviews, getRelatedProducts, listAllProducts, listCategories } from "./queries";
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
    const categories = apiCategories.map((c) => toCategoryInfo(c, apiCategories));
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
 * Categories for the shell (header, footer, menus) without loading every product. Falls back to the full
 * catalogue when the API does not send per-category counts yet, or cannot be reached (same failure rules).
 */
export const getShellCatalog = cache(async (): Promise<Pick<Catalog, "categories" | "failed">> => {
  const apiCategories = await listCategories().catch(() => null);
  if (!apiCategories || apiCategories.some((category) => category.product_count === undefined)) return getCatalog();
  return { categories: apiCategories.map((category) => toCategoryInfo(category, apiCategories)), failed: false };
});

/**
 * One product with its full description and review summary, or null when the slug does not exist (404).
 * Any other failure (network, 5xx) is thrown so the route's error boundary shows a retry instead of a false 404.
 */
export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  try {
    const [product, categories, reviews] = await Promise.all([
      getProduct(slug),
      listCategories(),
      // A review summary is optional decoration: failing to load it must not break the page. It is asked for
      // alongside the product rather than after it, so the page waits for one round trip instead of two.
      getProductReviews(slug, { page_size: 1 }).catch(() => null),
    ]);
    const base = toProduct(product, categories);
    return reviews ? withReviewSummary(base, reviews) : base;
  } catch (error) {
    if (error instanceof ApiError && error.isNotFound) return null;
    throw error;
  }
});

/**
 * The API's "you may also like" picks for a product, or null when they could not be loaded, so the page can fall
 * back to its own same-category list instead of dropping the section.
 */
export const getRelatedProductsBySlug = cache(async (slug: string, limit: number): Promise<Product[] | null> => {
  try {
    const [related, categories] = await Promise.all([getRelatedProducts(slug, limit), listCategories()]);
    return related.map((p) => toProduct(p, categories));
  } catch {
    return null;
  }
});
