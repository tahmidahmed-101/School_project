import type { ApiBusinessProfile } from "@/lib/api/types";
import { toPaisa } from "@/lib/money";

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
  /**
   * The floating contact button's links, taken only from the admin business profile (never the static values
   * above); an empty one hides that option, and with all three empty the button is not shown.
   */
  contact: { phoneTel: "", whatsapp: "", messenger: "" },
  /** Filled from the admin business profile; an empty link hides that icon. */
  social: { instagram: "", tiktok: "", youtube: "", linkedin: "" },
  mapsUrl: "",
  /** Filled from the admin business profile; while empty the footer shows its own built-in text. */
  openingHours: "",
  about: { en: "", bn: "" },
  /** Stock-order subtotal that earns free delivery, as the API's decimal string; null while the offer is off. */
  freeDeliveryMinAmount: null as string | null,
  /** Terms the shopper accepts before placing a pre-order, as staff wrote them; both empty for none. */
  preorderTerms: { en: "", bn: "" },
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

/** m.me link for a Facebook page URL (facebook.com/kullmartbd -> m.me/kullmartbd); "" when it is not one. */
function messengerLink(facebook: string): string {
  const match = /^https?:\/\/(?:[\w-]+\.)?facebook\.com\/([^/?#]+)/i.exec(facebook);
  return match && match[1] !== "profile.php" ? `https://m.me/${match[1]}` : "";
}

/** Values a fresh backend ships with before anyone fills in the business profile; never shown to shoppers. */
const PLACEHOLDER_PHONES = new Set(["01700000000", "8801700000000"]);
const isPlaceholderPhone = (value: string) => PLACEHOLDER_PHONES.has(digitsOnly(value));
const isPlaceholderEmail = (value: string) => /@example\.(com|org|net)$/i.test(value);
const PLACEHOLDER_NAMES = new Set(["launchcart", "launchcart ltd"]);
const realName = (value: string | undefined) => {
  const name = value?.trim() ?? "";
  return PLACEHOLDER_NAMES.has(name.toLowerCase()) ? "" : name;
};

/**
 * BRAND_INFO with the store's name, contact details, opening hours and about text from GET /business-profile/
 * laid over it. The taglines and slogan stay static. A field is replaced only when the API actually has a
 * value, so an empty field or an unreachable backend falls back to the static one.
 * A placeholder left over from setup (LaunchCart, admin@example.com, 01700000000) counts as empty.
 */
export function mergeBrand(profile: ApiBusinessProfile | null | undefined): BrandInfo {
  if (!profile) return BRAND_INFO;
  const name = realName(profile.name);
  const legalName = realName(profile.legal_name);
  const phone = isPlaceholderPhone(profile.phone) ? "" : profile.phone.trim();
  const whatsapp = isPlaceholderPhone(profile.whatsapp) ? "" : digitsOnly(profile.whatsapp);
  const email = isPlaceholderEmail(profile.email.trim()) ? "" : profile.email.trim();
  const address = profile.address.trim();
  const facebook = profile.social?.facebook?.trim();
  const social = {
    instagram: profile.social?.instagram?.trim() ?? "",
    tiktok: profile.social?.tiktok?.trim() ?? "",
    youtube: profile.social?.youtube?.trim() ?? "",
    linkedin: profile.social?.linkedin?.trim() ?? "",
  };
  const mapsUrl = profile.google_maps_url?.trim() ?? "";
  const freeDeliveryMin = profile.free_delivery_min_amount?.trim() ?? "";
  // A logo uploaded in the dashboard replaces the built-in one in the header, the footer and search results.
  const logo = /^https?:\/\//.test(profile.logo_url?.trim() ?? "") ? profile.logo_url.trim() : "";
  return {
    ...BRAND_INFO,
    ...(name && { name }),
    ...(legalName && { legalName }),
    ...(phone && {
      phone,
      phoneInternational: phone,
      phoneTel: phone.replace(/[^\d+]/g, ""),
    }),
    ...(whatsapp && { whatsapp }),
    ...(email && { email }),
    ...(address && { address: { en: address, bn: address } }),
    ...(facebook && { facebook }),
    ...(logo && { logo, logoCart: logo }),
    social,
    contact: {
      phoneTel: phone.replace(/[^\d+]/g, ""),
      whatsapp,
      messenger: messengerLink(facebook ?? ""),
    },
    mapsUrl,
    openingHours: profile.opening_hours?.trim() ?? "",
    about: { en: profile.about?.en?.trim() ?? "", bn: profile.about?.bn?.trim() ?? "" },
    freeDeliveryMinAmount: toPaisa(freeDeliveryMin) > BigInt(0) ? freeDeliveryMin : null,
    preorderTerms: { en: profile.preorder_terms?.en?.trim() ?? "", bn: profile.preorder_terms?.bn?.trim() ?? "" },
  };
}
