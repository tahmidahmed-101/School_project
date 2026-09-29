import { CACHE_LIFE, CACHE_TAGS } from "@/lib/cache";
import { apiRequest, fetchAllPages } from "@/lib/api/client";
import type { ApiCategory, ApiProduct, ApiReviewPage, ProductListParams } from "@/lib/api/types";

/** Server-side cache for catalogue reads. Pages revalidate in the background after CACHE_LIFE.catalog. */
const CACHE = { revalidate: CACHE_LIFE.catalog, tags: [CACHE_TAGS.catalog] };

/** GET /catalog/categories/ — active categories (not paginated). */
export const listCategories = () => apiRequest<ApiCategory[]>("/catalog/categories/", CACHE);

/** GET /catalog/products/ — every page (100 per request), for storefront-side filtering. */
export const listAllProducts = (params: Omit<ProductListParams, "page" | "page_size"> = {}) =>
  fetchAllPages<ApiProduct>("/catalog/products/", { ...CACHE, query: { ...params } });

/** GET /catalog/products/{slug}/ */
export const getProduct = (slug: string) =>
  apiRequest<ApiProduct>(`/catalog/products/${encodeURIComponent(slug)}/`, CACHE);

/** GET /catalog/products/{slug}/reviews/ — a page of reviews plus average_rating / review_count. */
export const getProductReviews = (
  slug: string,
  params: { ordering?: "created_at" | "-created_at"; page?: number; page_size?: number } = {},
) =>
  apiRequest<ApiReviewPage>(`/catalog/products/${encodeURIComponent(slug)}/reviews/`, {
    ...CACHE,
    query: { ...params },
  });
