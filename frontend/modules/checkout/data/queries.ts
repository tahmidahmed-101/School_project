import { CACHE_LIFE } from "@/lib/cache";
import { apiRequest } from "@/lib/api/client";
import type { ApiPaymentMethod } from "@/lib/api/types";

/** GET /payment-methods/ — enabled methods; the chosen `key` is sent as `payment_method` to POST /checkout/. */
export const listPaymentMethods = () =>
  apiRequest<ApiPaymentMethod[]>("/payment-methods/", { revalidate: CACHE_LIFE.paymentMethods });
