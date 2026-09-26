import { apiRequest, fetchAllPages } from "./client";
import type {
  ApiBundle,
  ApiCategory,
  ApiPage,
  ApiProduct,
  ApiReviewPage,
  ProductListParams,
} from "./types";

/** Server-side cache lifetime for catalogue reads (seconds). Pages revalidate in the background after this. */
export const CATALOG_REVALIDATE = 60;
const CACHE = { revalidate: CATALOG_REVALIDATE, tags: ["catalog"] };

/** GET /catalog/categories/ — active categories (not paginated). */
export const listCategories = () => apiRequest<ApiCategory[]>("/catalog/categories/", CACHE);

/** GET /catalog/categories/{slug}/ */
export const getCategory = (slug: string) =>
  apiRequest<ApiCategory>(`/catalog/categories/${encodeURIComponent(slug)}/`, CACHE);

/** GET /catalog/products/ — one page. */
export const listProducts = (params: ProductListParams = {}) =>
  apiRequest<ApiPage<ApiProduct>>("/catalog/products/", { ...CACHE, query: { ...params } });

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

/** GET /catalog/bundles/ — not used by the UI yet (no bundle component exists); ready for when one does. */
export const listBundles = (
  params: { search?: string; ordering?: string; page?: number; page_size?: number } = {},
) => apiRequest<ApiPage<ApiBundle>>("/catalog/bundles/", { ...CACHE, query: { ...params } });

/** GET /catalog/bundles/{slug}/ */
export const getBundle = (slug: string) =>
  apiRequest<ApiBundle>(`/catalog/bundles/${encodeURIComponent(slug)}/`, CACHE);
