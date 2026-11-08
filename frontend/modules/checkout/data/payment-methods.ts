import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { CACHE_LIFE } from "@/lib/cache";

/** GET /payment-methods/ — the methods switched on for the shop (the backend answers with the stock ones). */
export function getPaymentMethods(): Promise<ApiPaymentMethod[]> {
  return apiRequest<ApiPaymentMethod[]>("/payment-methods/", {
    revalidate: CACHE_LIFE.paymentMethods,
  });
}
