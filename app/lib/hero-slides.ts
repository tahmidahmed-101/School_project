import type { T } from "./types";

export interface HeroSlide {
  id: string;
  tag: T;
  /** Lines are separated by "\n". */
  title: T;
  ctaText: T;
  ctaLink: string;
  image: string;
  imageAlt: string;
  gradient: string;
}

export interface HeroPromo {
  id: string;
  eyebrow: T;
  /** Lines are separated by "\n". */
  title: T;
  href: string;
  image: string;
  imageAlt: string;
  /** Tailwind gradient utilities for the card background. */
  gradientClass: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "gadgets-audio",
    tag: { en: "GADGETS · WIRELESS AUDIO", bn: "গ্যাজেটস · ওয়্যারলেস অডিও" },
    title: {
      en: "Wireless Earbuds\nSmall Size, Big Sound",
      bn: "ওয়্যারলেস ইয়ারবাড\nছোট সাইজ, দারুণ সাউন্ড",
    },
    ctaText: { en: "Shop Gadgets", bn: "গ্যাজেটস দেখুন" },
    ctaLink: "/shop?category=gadgets",
    image: "products/hoco-eq33-earbuds.jpg",
    imageAlt: "Hoco EQ33 wireless earbuds",
    gradient: "linear-gradient(135deg, #0f2a0d 0%, #1b4816 50%, #276325 100%)",
  },
  {
    id: "womens-fashion",
    tag: { en: "WOMEN'S FASHION · INNERWEAR", bn: "নারীদের ফ্যাশন · ইনারওয়্যার" },
    title: {
      en: "Padded Side-Tie\nTank Tops",
      bn: "প্যাডেড সাইড-টাই\nট্যাঙ্ক টপ",
    },
    ctaText: { en: "Shop Women's", bn: "নারীদের কালেকশন" },
    ctaLink: "/shop?category=womens-fashion",
    image: "products/tank-top-multi.jpg",
    imageAlt: "Padded side-tie tank tops in five colours",
    gradient: "linear-gradient(135deg, #1b4816 0%, #276325 55%, #3a8036 100%)",
  },
  {
    id: "jewellery",
    tag: { en: "JEWELLERY · GOLD-TONE CUFFS", bn: "জুয়েলারি · গোল্ড-টোন কাফ" },
    title: {
      en: "Statement Gold\nCuff & Ring Sets",
      bn: "স্টেটমেন্ট গোল্ড\nকাফ ও রিং সেট",
    },
    ctaText: { en: "Shop Jewellery", bn: "জুয়েলারি দেখুন" },
    ctaLink: "/shop?category=jewellery",
    image: "products/gold-sunflower-cuff-1.jpg",
    imageAlt: "Gold sunflower cuff bracelet with matching ring",
    gradient: "linear-gradient(135deg, #7a5d16 0%, #a98223 50%, #c0962d 100%)",
  },
  {
    id: "kids",
    tag: { en: "KIDS · PLUSH BACKPACKS", bn: "কিডস · প্লাশ ব্যাকপ্যাক" },
    title: {
      en: "Cuddly Backpacks\nFor Little Ones",
      bn: "ছোটদের জন্য\nনরম প্লাশ ব্যাকপ্যাক",
    },
    ctaText: { en: "Shop Kids", bn: "কিডস কালেকশন" },
    ctaLink: "/shop?category=kids",
    image: "products/hello-kitty-backpack-1.jpg",
    imageAlt: "Hello Kitty kids plush backpack",
    gradient: "linear-gradient(135deg, #0f2a0d 0%, #1f4f1d 50%, #3a8036 100%)",
  },
];

export const HERO_PROMOS: HeroPromo[] = [
  {
    id: "bags",
    eyebrow: { en: "BAGS & WALLETS", bn: "ব্যাগ ও ওয়ালেট" },
    title: { en: "Hobo Shoulder\nBags", bn: "হোবো শোল্ডার\nব্যাগ" },
    href: "/shop?category=bags-wallets",
    image: "products/hobo-bag-black-2.jpg",
    imageAlt: "Black leather-look hobo shoulder bag",
    gradientClass: "from-brand-900 via-brand-800 to-brand-700",
  },
  {
    id: "lifestyle",
    eyebrow: { en: "HOME & LIFESTYLE", bn: "হোম ও লাইফস্টাইল" },
    title: { en: "Mini Thermos\nFlasks", bn: "মিনি থার্মোস\nফ্লাস্ক" },
    href: "/shop?category=lifestyle",
    image: "products/steel-flask-2.jpg",
    imageAlt: "Mini stainless steel thermos flasks in assorted colours",
    gradientClass: "from-[#7a5d16] via-[#a98223] to-[#c0962d]",
  },
];
