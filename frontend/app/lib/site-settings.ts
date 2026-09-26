import type { T } from "./types";

export interface Voucher {
  code: string;
  /** Headline shown big on the card, e.g. "৳100 OFF". */
  title: T;
  condition: T;
}

/**
 * Storefront switches and content that an admin panel would control.
 * There is no admin backend yet, so this is the single place to flip a section on/off;
 * when an admin panel exists, load this object from its API instead.
 */
export const SITE_SETTINGS = {
  voucherSection: {
    enabled: true,
    vouchers: [
      {
        code: "WELCOME100",
        title: { en: "৳100 OFF", bn: "৳১০০ ছাড়" },
        condition: { en: "Min. spend ৳1,000", bn: "সর্বনিম্ন খরচ ৳১,০০০" },
      },
      {
        code: "KULL10",
        title: { en: "10% OFF", bn: "১০% ছাড়" },
        condition: { en: "Min. spend ৳2,500", bn: "সর্বনিম্ন খরচ ৳২,৫০০" },
      },
      {
        code: "FREESHIP",
        title: { en: "FREE DELIVERY", bn: "ফ্রি ডেলিভারি" },
        condition: { en: "Min. spend ৳2,000", bn: "সর্বনিম্ন খরচ ৳২,০০০" },
      },
      {
        code: "KULL500",
        title: { en: "৳500 OFF", bn: "৳৫০০ ছাড়" },
        condition: { en: "Min. spend ৳5,000", bn: "সর্বনিম্ন খরচ ৳৫,০০০" },
      },
    ] as Voucher[],
  },
};
