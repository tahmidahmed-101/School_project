import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { CACHE_LIFE } from "@/lib/cache";

/**
 * GET /payment-methods/ — enabled methods; the chosen `key` is sent as `payment_method` to POST /checkout/.
 * No built-in method: if the list cannot be loaded or is empty, checkout shows the error page.
 */
export async function getPaymentMethods(): Promise<ApiPaymentMethod[]> {
  const methods = await apiRequest<ApiPaymentMethod[]>("/payment-methods/", {
    revalidate: CACHE_LIFE.paymentMethods,
  });
  if (methods.length === 0) throw new Error("No payment method is enabled for the storefront.");
  return methods;
}
