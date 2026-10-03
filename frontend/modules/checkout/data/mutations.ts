import { ApiError, apiRequest } from "@/lib/api/client";
import { GUEST_CART_TOKEN_HEADER } from "@/modules/cart";
import type {
  ApiCheckoutItem,
  ApiCheckoutRequest,
  ApiCouponPreview,
  ApiOrder,
  ApiShippingQuote,
} from "@/lib/api/types";

/** The saved cart cannot be checked out: unknown or used token, already ordered, or emptied elsewhere. */
const CART_UNUSABLE_CODES = new Set(["guest_cart_not_found", "not_pending", "empty_order"]);

/**
 * POST /checkout/ — guest checkout. The backend prices the order: subtotal, tax, shipping (from its shipping zones),
 * discount and grand total in the response are authoritative. Throws ApiError; `fields` carries per-field messages
 * keyed like the request ("email", "shipping_address.postal_code", "items.0.quantity").
 * `payment_method` is required. A coupon that turns out invalid is dropped by the backend rather than failing the order.
 *
 * `cartToken` (from `syncedGuestCartToken`) checks out the shopper's saved guest cart instead of the request's
 * item list. If that cart turns out to be unusable, nothing was ordered and the item list is sent as before.
 */
export async function placeOrder(request: ApiCheckoutRequest, cartToken?: string | null): Promise<ApiOrder> {
  if (cartToken) {
    try {
      // With the token the saved guest cart becomes the order, so it supplies the items.
      return await apiRequest<ApiOrder>("/checkout/", {
        method: "POST",
        body: { ...request, items: undefined },
        headers: { [GUEST_CART_TOKEN_HEADER]: cartToken },
      });
    } catch (error) {
      if (!(error instanceof ApiError && CART_UNUSABLE_CODES.has(error.code))) throw error;
    }
  }
  return apiRequest<ApiOrder>("/checkout/", { method: "POST", body: request });
}

/**
 * POST /checkout/coupon/ — checks a code against the cart before the order is placed. Throws ApiError with code
 * invalid_coupon | coupon_expired | coupon_usage_limit_reached | coupon_minimum_not_met (message is shopper-ready).
 */
export const validateCoupon = (code: string, items: ApiCheckoutItem[], signal?: AbortSignal) =>
  apiRequest<ApiCouponPreview>("/checkout/coupon/", { method: "POST", body: { code, items }, signal });

/**
 * POST /checkout/shipping-quote/ — delivery fee for the cart to a typed address (matched against the shipping zones).
 * Throws ApiError zone_not_found when the store does not deliver there.
 */
export const quoteShipping = (items: ApiCheckoutItem[], addressText: string, signal?: AbortSignal) =>
  apiRequest<ApiShippingQuote>("/checkout/shipping-quote/", {
    method: "POST",
    body: { items, address_text: addressText },
    signal,
  });
