import "server-only";
import { cache } from "react";
import { toVoucher, type Voucher } from "../domain/vouchers";
import { listStorefrontCoupons } from "./queries";

/** Vouchers for the "Collect vouchers" strip; none if the API is down, so the page still renders without the strip. */
export const getVouchers = cache(async (): Promise<Voucher[]> => {
  try {
    return (await listStorefrontCoupons()).map(toVoucher);
  } catch {
    return [];
  }
});
