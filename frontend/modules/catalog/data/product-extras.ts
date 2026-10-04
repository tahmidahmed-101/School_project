import { apiRequest } from "@/lib/api/client";
import type { ApiPage, ApiPriceReportInput, ApiQuestion, ApiReviewPage } from "@/lib/api/types";

/**
 * Reads behind the product page accordions. Called from the browser when an accordion opens, uncached, so a review
 * or an answer published in the dashboard shows up without waiting for the page to be regenerated.
 */
export const EXTRAS_PAGE_SIZE = 5;

/** GET /catalog/products/{slug}/reviews/ — newest first; every review is a verified purchase. */
export const fetchProductReviews = (slug: string, page: number) =>
  apiRequest<ApiReviewPage>(`/catalog/products/${encodeURIComponent(slug)}/reviews/`, {
    query: { page, page_size: EXTRAS_PAGE_SIZE },
  });

/** GET /catalog/products/{slug}/questions/ — only questions staff have answered and published. */
export const fetchProductQuestions = (slug: string, page: number) =>
  apiRequest<ApiPage<ApiQuestion>>(`/catalog/products/${encodeURIComponent(slug)}/questions/`, {
    query: { page, page_size: EXTRAS_PAGE_SIZE },
  });

/** Customer API paths (sent through useAuth().authRequest, which adds the access token). */
export const questionPath = (productId: string) => `/questions/products/${productId}/`;
export const priceReportPath = (productId: string) => `/price-reports/products/${productId}/`;

/**
 * Body for a price report from the form's raw text. Returns null when there is nothing to send: the API needs the
 * expected price or a comment, and a price has to be above zero.
 */
export function toPriceReportInput(
  expectedPrice: string,
  comment: string,
  variantId: string | undefined,
): { input: ApiPriceReportInput } | { error: "required" | "invalid_price" } {
  const price = expectedPrice.trim();
  const note = comment.trim();
  if (!price && !note) return { error: "required" };
  const amount = Number(price);
  if (price && !(Number.isFinite(amount) && amount > 0)) return { error: "invalid_price" };
  return {
    input: {
      ...(variantId && { variant_id: variantId }),
      ...(price && { expected_price: amount.toFixed(2) }),
      ...(note && { comment: note }),
    },
  };
}
