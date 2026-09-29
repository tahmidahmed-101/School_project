import type { T } from "@/lib/types";

export interface HeroSlide {
  image: string;
  alt: string;
  tag: T;
  /** Lines are separated by "\n". */
  title: T;
}

export const HERO_CTA_TEXT: T = { en: "Shop Now", bn: "কিনুন" };

export const HERO_SLIDES: HeroSlide[] = [
  {
    image: "brand/hero-banner.png",
    alt: "Kull Mart hero banner: phones, earbuds, laptop, headphones and everyday accessories",
    tag: { en: "NEW ARRIVALS · TECH & LIFESTYLE", bn: "নতুন সংগ্রহ · টেক ও লাইফস্টাইল" },
    title: {
      en: "Everyday Essentials\nDelivered Fast",
      bn: "প্রয়োজনীয় পণ্য\nদ্রুত ডেলিভারিতে",
    },
  },
  {
    image: "brand/hero-banner-audio.jpg",
    alt: "Speaker, headphones, earbuds, smartwatch and power bank on a marble display",
    tag: { en: "GADGETS & AUDIO", bn: "গ্যাজেটস ও অডিও" },
    title: {
      en: "Sound That Moves\nWith You",
      bn: "আপনার সঙ্গী\nসেরা সাউন্ড",
    },
  },
  {
    image: "brand/hero-banner-fashion.jpg",
    alt: "Handbag, loafers, sunglasses, gold cuff and folded tops on a marble display",
    tag: { en: "WOMEN'S FASHION & ACCESSORIES", bn: "নারীদের ফ্যাশন ও অ্যাক্সেসরিজ" },
    title: {
      en: "Style For Every\nOccasion",
      bn: "প্রতিটি উপলক্ষে\nআপনার স্টাইল",
    },
  },
  {
    image: "brand/hero-banner-lifestyle.jpg",
    alt: "Flask, mini fan, tumbler, diffuser, sneakers and notebook on a marble display",
    tag: { en: "HOME & LIFESTYLE", bn: "হোম ও লাইফস্টাইল" },
    title: {
      en: "Little Things That\nMake Life Better",
      bn: "ছোট ছোট জিনিসে\nজীবন আরও সুন্দর",
    },
  },
  {
    image: "brand/hero-banner-workspace.jpg",
    alt: "Phone, laptop, headphones, smartwatch and folded tops on a marble display",
    tag: { en: "TECH & FASHION", bn: "টেক ও ফ্যাশন" },
    title: {
      en: "All You Love,\nOne Store",
      bn: "সব পছন্দ,\nএক দোকানে",
    },
  },
];
