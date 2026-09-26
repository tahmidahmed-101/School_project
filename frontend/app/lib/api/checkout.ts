import { apiRequest } from "./client";
import type { ApiCheckoutRequest, ApiOrder, ApiPaymentMethod } from "./types";

/**
 * POST /checkout/ — guest checkout. The backend prices the order: subtotal, tax, shipping (from its shipping zones),
 * discount and grand total in the response are authoritative. Throws ApiError; `fields` carries per-field messages
 * keyed like the request ("email", "shipping_address.postal_code", "items.0.quantity").
 */
export const placeOrder = (request: ApiCheckoutRequest) =>
  apiRequest<ApiOrder>("/checkout/", { method: "POST", body: request });

/**
 * GET /payment-methods/ — enabled methods. Informational only: POST /checkout/ has no payment-method field,
 * so the choice cannot be submitted (see the integration notes).
 */
export const listPaymentMethods = () =>
  apiRequest<ApiPaymentMethod[]>("/payment-methods/", { revalidate: 300 });
