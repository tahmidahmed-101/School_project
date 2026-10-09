import "server-only";
import { apiRequest } from "@/lib/api/client";
import type { ApiPaymentMethod } from "@/lib/api/types";
import { CACHE_LIFE } from "@/lib/cache";
import type { ProductKind } from "@/lib/product";
import type { PaymentMethodsByKind } from "../domain/checkout";

/** GET /payment-methods/?kind= — the methods switched on for one half of the shop. */
export function getPaymentMethods(kind: ProductKind): Promise<ApiPaymentMethod[]> {
  return apiRequest<ApiPaymentMethod[]>("/payment-methods/", {
    query: { kind },
    revalidate: CACHE_LIFE.paymentMethods,
  });
}

/** Both lists: the basket lives in the browser, so the page cannot know its kind while it renders on the server. */
export async function getPaymentMethodsByKind(): Promise<PaymentMethodsByKind> {
  const [stock, preorder] = await Promise.all([getPaymentMethods("stock"), getPaymentMethods("preorder")]);
  return { stock, preorder };
}
