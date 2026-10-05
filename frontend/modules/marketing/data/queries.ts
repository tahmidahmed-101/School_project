import { CACHE_LIFE } from "@/lib/cache";
import { apiRequest } from "@/lib/api/client";
import type { ApiStorefrontCoupon } from "@/lib/api/types";

/** GET /checkout/coupons/ — the coupons the store advertises; each `code` is accepted by POST /checkout/coupon/. */
export const listStorefrontCoupons = () =>
  apiRequest<ApiStorefrontCoupon[]>("/checkout/coupons/", { revalidate: CACHE_LIFE.vouchers });
