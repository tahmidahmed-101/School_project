import type { ApiBusinessProfile } from "@/lib/api/types";

/** Contact details and copy taken from the public Kull Mart Facebook page (facebook.com/kullmartbd). */
export const BRAND_INFO = {
  name: "Kull Mart",
  legalName: "Kull Mart",
  tagline: {
    en: "Women's fashion, innerwear, kids & gadgets",
    bn: "নারীদের ফ্যাশন, ইনারওয়্যার, কিডস ও গ্যাজেটস",
  },
  slogan: {
    en: "Women Fashion, Innerwear, Kids & Gadgets | Wholesale & Retail | BD Delivery",
    bn: "নারীদের ফ্যাশন, ইনারওয়্যার, কিডস ও গ্যাজেটস | পাইকারি ও খুচরা | সারাদেশে ডেলিভারি",
  },
  address: {
    en: "Dhaka, Bangladesh",
    bn: "ঢাকা, বাংলাদেশ",
  },
  city: "Dhaka",
  district: "Dhaka",
  phone: "01603-671030",
  phoneInternational: "+880 1603-671030",
  /** Digits only, for wa.me links. */
  whatsapp: "8801603671030",
  /** For tel: links. */
  phoneTel: "+8801603671030",
  email: "kullmart2026@gmail.com",
  facebook: "https://www.facebook.com/kullmartbd",
  logo: "brand/logo.png",
  logoMark: "brand/logo-mark.png",
  /** Gold cart cut out of the logo on a transparent background, for the green header. */
  logoCart: "brand/logo-cart.png",
  deliveryCommitment: {
    en: "Delivery all across Bangladesh, with wholesale and retail orders welcome.",
    bn: "সারা বাংলাদেশে ডেলিভারি — পাইকারি ও খুচরা দুই ধরনের অর্ডারই গ্রহণ করা হয়।",
  },
};

export type BrandInfo = typeof BRAND_INFO;

const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Values a fresh backend ships with before anyone fills in the business profile; never shown to shoppers. */
const PLACEHOLDER_PHONES = new Set(["01700000000", "8801700000000"]);
const isPlaceholderPhone = (value: string) => PLACEHOLDER_PHONES.has(digitsOnly(value));
const isPlaceholderEmail = (value: string) => /@example\.(com|org|net)$/i.test(value);

/**
 * BRAND_INFO with the storefront's live contact details from GET /business-profile/ laid over it.
 * The brand identity (name, logo, taglines, copy) stays static. Contact fields are replaced only when the
 * API actually has a value, so an empty field or an unreachable backend falls back to the static one.
 * A placeholder left over from setup (admin@example.com, 01700000000) counts as empty.
 */
export function mergeBrand(profile: ApiBusinessProfile | null | undefined): BrandInfo {
  if (!profile) return BRAND_INFO;
  const phone = isPlaceholderPhone(profile.phone) ? "" : profile.phone.trim();
  const whatsapp = isPlaceholderPhone(profile.whatsapp) ? "" : digitsOnly(profile.whatsapp);
  const email = isPlaceholderEmail(profile.email.trim()) ? "" : profile.email.trim();
  const address = profile.address.trim();
  const facebook = profile.social?.facebook?.trim();
  return {
    ...BRAND_INFO,
    ...(phone && {
      phone,
      phoneInternational: phone,
      phoneTel: phone.replace(/[^\d+]/g, ""),
    }),
    ...(whatsapp && { whatsapp }),
    ...(email && { email }),
    ...(address && { address: { en: address, bn: address } }),
    ...(facebook && { facebook }),
  };
}
