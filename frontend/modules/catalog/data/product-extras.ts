import { apiRequest } from "@/lib/api/client";
import type { ApiPage, ApiPriceReportInput, ApiQuestion, ApiReviewPage } from "@/lib/api/types";

/**
 * Reads behind the product page accordions. Called from the browser when an accordion opens, uncached, so a review
 * or an answer published in the dashboard shows up without waiting for the page to be regenerated.
 */
const EXTRAS_PAGE_SIZE = 5;

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
/** POST { rating 1-5, comment? }: one review per product, only after a delivered order of it. */
export const reviewPath = (productId: string) => `/reviews/products/${productId}/`;

/** The backend's limits on a review's pictures (MAX_REVIEW_IMAGES, MAX_UPLOAD_SIZE). */
export const MAX_REVIEW_PHOTOS = 5;
export const MAX_REVIEW_PHOTO_BYTES = 10 * 1024 * 1024;

export type PhotoRefusal = "tooMany" | "tooLarge" | "notImage";

/**
 * Which of the newly chosen files join a review that already has `current` photos, and why the rest were left
 * out. A phone can hand over a HEIC with no MIME type, so a file with no type is let through for the backend,
 * which decides by decoding it.
 */
export function acceptReviewPhotos(
  current: number,
  chosen: File[],
): { accepted: File[]; refusal: PhotoRefusal | null } {
  let refusal: PhotoRefusal | null = null;
  const accepted: File[] = [];
  for (const file of chosen) {
    if (file.type && !file.type.startsWith("image/")) refusal ??= "notImage";
    else if (file.size > MAX_REVIEW_PHOTO_BYTES) refusal ??= "tooLarge";
    else if (current + accepted.length >= MAX_REVIEW_PHOTOS) refusal ??= "tooMany";
    else accepted.push(file);
  }
  return { accepted, refusal };
}

/** The review as the multipart body the API takes when photos are attached. */
export function reviewFormData(rating: number, comment: string, photos: File[]): FormData {
  const form = new FormData();
  form.append("rating", String(rating));
  form.append("comment", comment);
  for (const photo of photos) form.append("images", photo);
  return form;
}
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
