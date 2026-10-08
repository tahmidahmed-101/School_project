import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { CACHE_LIFE } from "@/lib/cache";

const COD_FALLBACK: ApiPaymentMethod[] = [{ key: "cod", label: "Cash on delivery", description: "" }];

/**
 * GET /payment-methods/ — enabled methods; the chosen `key` is sent as `payment_method` to POST /checkout/.
 * Falls back to cash on delivery if the list is empty or cannot be loaded, so checkout always has a method.
 */
export async function getPaymentMethods(): Promise<ApiPaymentMethod[]> {
  try {
    const methods = await apiRequest<ApiPaymentMethod[]>("/payment-methods/", {
      revalidate: CACHE_LIFE.paymentMethods,
    });
    return methods.length > 0 ? methods : COD_FALLBACK;
  } catch {
    return COD_FALLBACK;
  }
}
