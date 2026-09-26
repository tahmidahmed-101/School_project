import { apiRequest } from "./client";
import type {
  ApiCheckoutItem,
  ApiCheckoutRequest,
  ApiCouponPreview,
  ApiOrder,
  ApiPaymentMethod,
  ApiShippingQuote,
} from "./types";

/**
 * POST /checkout/ — guest checkout. The backend prices the order: subtotal, tax, shipping (from its shipping zones),
 * discount and grand total in the response are authoritative. Throws ApiError; `fields` carries per-field messages
 * keyed like the request ("email", "shipping_address.postal_code", "items.0.quantity").
 * `payment_method` is required. A coupon that turns out invalid is dropped by the backend rather than failing the order.
 */
export const placeOrder = (request: ApiCheckoutRequest) =>
  apiRequest<ApiOrder>("/checkout/", { method: "POST", body: request });

/** GET /payment-methods/ — enabled methods; the chosen `key` is sent as `payment_method` to POST /checkout/. */
export const listPaymentMethods = () =>
  apiRequest<ApiPaymentMethod[]>("/payment-methods/", { revalidate: 300 });

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
