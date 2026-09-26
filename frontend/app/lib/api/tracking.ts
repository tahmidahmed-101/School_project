import { apiRequest } from "./client";
import type { ApiTrackOrder } from "./types";

/**
 * Order tracking by order number + phone.
 *
 * VERIFIED against the running backend: the route is /tracking/orders/track/. The OpenAPI document lists
 * /tracking/track/, which answers 404 — do not "fix" this back to the YAML path.
 * A wrong order number or phone is a 404 with code `order_not_found` (deliberately the same for both).
 */
export const trackOrder = (orderNumber: string, phone: string) =>
  apiRequest<ApiTrackOrder>("/tracking/orders/track/", {
    method: "POST",
    body: { order_number: orderNumber.trim(), phone: phone.trim() },
  });
