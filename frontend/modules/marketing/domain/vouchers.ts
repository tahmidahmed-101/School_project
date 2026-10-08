import type { ApiStorefrontCoupon } from "@/lib/api/types";

/** A coupon the store chose to advertise (dashboard: Coupons > "Show on storefront"). */
export interface Voucher {
  code: string;
  kind: "percentage" | "fixed";
  /** Percent off for "percentage", taka off for "fixed". */
  value: number;
  /** Cart subtotal needed before the code applies; 0 means no minimum. */
  minSpend: number;
  /** API timestamp after which the code stops working; null when it does not expire. */
  expiresAt: string | null;
}

export function toVoucher(coupon: ApiStorefrontCoupon): Voucher {
  return {
    code: coupon.code,
    kind: coupon.discount_type === "fixed" ? "fixed" : "percentage",
    value: Number(coupon.value),
    minSpend: Number(coupon.min_order_amount),
    expiresAt: coupon.expires_at || null,
  };
}

/** Collected codes that the store still offers; a code that was withdrawn or ran out is dropped. */
export const collectedVouchers = (vouchers: Voucher[], collectedCodes: string[]): Voucher[] =>
  vouchers.filter((voucher) => collectedCodes.includes(voucher.code));
