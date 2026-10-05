"use client";

import { useCallback, useEffect, useState } from "react";
import { useLang } from "@/lib/i18n";
import { usePersistedState } from "@/lib/usePersistedState";
import { listStorefrontCoupons } from "../data/queries";
import { collectedVouchers, toVoucher, type Voucher } from "../domain/vouchers";

/** Codes the shopper tapped "Collect" on, kept in this browser so checkout can offer them back. */
export function useCollectedCodes() {
  const [codes, setCodes] = usePersistedState<string[]>("km-collected-vouchers", []);
  const collect = useCallback(
    (code: string) => setCodes((prev) => (prev.includes(code) ? prev : [...prev, code])),
    [setCodes],
  );
  return { codes, collect };
}

/** The shopper's collected vouchers that are still on offer, for checkout. Empty until loaded or if the list fails. */
export function useCollectedVouchers(): Voucher[] {
  const { codes } = useCollectedCodes();
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const hasCodes = codes.length > 0;

  useEffect(() => {
    if (!hasCodes) return;
    let cancelled = false;
    listStorefrontCoupons()
      .then((list) => {
        if (!cancelled) setVouchers(list.map(toVoucher));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [hasCodes]);

  return collectedVouchers(vouchers, codes);
}

/** Shopper-facing wording for a voucher: the headline ("৳100 OFF", "10% OFF") and its spending condition. */
export function useVoucherText() {
  const { ui, money, n } = useLang();
  return {
    title: (voucher: Voucher) =>
      `${voucher.kind === "fixed" ? money(voucher.value) : `${n(voucher.value)}%`} ${ui("voucherOff")}`,
    condition: (voucher: Voucher) =>
      voucher.minSpend > 0 ? `${ui("voucherMinSpend")} ${money(voucher.minSpend)}` : ui("voucherNoMinSpend"),
  };
}
