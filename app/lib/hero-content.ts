import type { T } from "./types";

interface HeroBannerContent {
  tag: T;
  /** Lines are separated by "\n". */
  title: T;
  ctaText: T;
  ctaLink: string;
}

export const HERO_BANNER: HeroBannerContent = {
  tag: { en: "NEW ARRIVALS · TECH & LIFESTYLE", bn: "নতুন সংগ্রহ · টেক ও লাইফস্টাইল" },
  title: {
    en: "Everyday Essentials\nDelivered Fast",
    bn: "প্রতিদিনের প্রয়োজনীয় পণ্য\nদ্রুত ডেলিভারিতে",
  },
  ctaText: { en: "Shop Now", bn: "কিনুন" },
  ctaLink: "/shop",
};
