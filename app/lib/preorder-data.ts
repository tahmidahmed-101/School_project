import type { Product } from "./types";
import { makeProduct } from "./make-product";

/** Stock that is not on the shelf yet. Dates and quantities are sample values to be replaced with the real batch. */
export const PREORDER_PRODUCTS: Product[] = [
  makeProduct({
    id: "preorder-01",
    slug: "hoco-eq30-pure-sound-earbuds",
    sku: "PRE-KM-EQ30",
    category: "gadgets",
    name: { en: "Hoco EQ30 Pure Sound Earbuds", bn: "হোকো EQ30 পিউর সাউন্ড ইয়ারবাড" },
    tagline: {
      en: "Semi-in-ear wireless headset with a compact charging case",
      bn: "কমপ্যাক্ট চার্জিং কেসসহ সেমি-ইন-ইয়ার ওয়্যারলেস হেডসেট",
    },
    description: {
      en: "The Hoco EQ30 is a semi-in-ear wireless headset with Bluetooth 5.0 and a compact charging case. Reserve yours now and we will confirm dispatch as soon as the batch lands.",
      bn: "হোকো EQ30 — ব্লুটুথ ৫.০ ও কমপ্যাক্ট চার্জিং কেসসহ সেমি-ইন-ইয়ার ওয়্যারলেস হেডসেট। এখনই রিজার্ভ করুন, স্টক এলেই ডেলিভারির কথা জানানো হবে।",
    },
    images: ["hoco-eq30-earbuds.jpg"],
    price: 1390,
    stockCount: 100,
    badge: { en: "PRE-ORDER", bn: "প্রি-অর্ডার" },
    specs: [
      { label: { en: "Connection", bn: "কানেকশন" }, value: { en: "Bluetooth 5.0", bn: "ব্লুটুথ ৫.০" } },
      { label: { en: "Fit", bn: "ফিট" }, value: { en: "Semi-in-ear", bn: "সেমি-ইন-ইয়ার" } },
    ],
    preorder: {
      deliveryStart: "2026-10-10",
      deliveryEnd: "2026-10-16",
      expectedDelivery: { en: "October 10–16, 2026", bn: "১০–১৬ অক্টোবর, ২০২৬" },
      closesOn: "2026-10-06T23:59:59Z",
      preorderCloses: { en: "October 6, 2026", bn: "৬ অক্টোবর, ২০২৬" },
      maxQuantity: 150,
      currentQuantity: 62,
      status: "closing-soon",
    },
  }),
  makeProduct({
    id: "preorder-02",
    slug: "power-bank-20000",
    sku: "PRE-KM-PB20K",
    category: "gadgets",
    name: { en: "Ven-Dens 20000 Power Bank", bn: "ভেন-ডেন্স ২০০০০ পাওয়ার ব্যাংক" },
    tagline: {
      en: "20000 capacity power bank with a digital battery display",
      bn: "ডিজিটাল ব্যাটারি ডিসপ্লেসহ ২০০০০ ক্যাপাসিটির পাওয়ার ব্যাংক",
    },
    description: {
      en: "A high-capacity 20000 power bank (model VD-PB042) with a digital display for remaining charge. Keep phones running through long days, travel and load-shedding.",
      bn: "২০০০০ ক্যাপাসিটির পাওয়ার ব্যাংক (মডেল VD-PB042), বাকি চার্জ দেখার ডিজিটাল ডিসপ্লেসহ। লম্বা দিন, ভ্রমণ কিংবা লোডশেডিংয়েও ফোন চালু রাখুন।",
    },
    images: ["power-bank-20000.jpg"],
    price: 1650,
    stockCount: 100,
    badge: { en: "PRE-ORDER", bn: "প্রি-অর্ডার" },
    specs: [
      { label: { en: "Capacity", bn: "ক্যাপাসিটি" }, value: { en: "20000", bn: "২০০০০" } },
      { label: { en: "Model", bn: "মডেল" }, value: { en: "VD-PB042", bn: "VD-PB042" } },
    ],
    preorder: {
      deliveryStart: "2026-10-12",
      deliveryEnd: "2026-10-18",
      expectedDelivery: { en: "October 12–18, 2026", bn: "১২–১৮ অক্টোবর, ২০২৬" },
      closesOn: "2026-10-08T23:59:59Z",
      preorderCloses: { en: "October 8, 2026", bn: "৮ অক্টোবর, ২০২৬" },
      maxQuantity: 120,
      currentQuantity: 47,
      status: "closing-soon",
    },
  }),
  makeProduct({
    id: "preorder-03",
    slug: "gx-star-wireless-neckband",
    sku: "PRE-KM-GXSTAR",
    category: "gadgets",
    name: { en: "GiooX GX-Star Wireless Neckband", bn: "গিওএক্স GX-Star ওয়্যারলেস নেকব্যান্ড" },
    tagline: {
      en: "Magnetic-control neckband with call vibration alerts",
      bn: "ম্যাগনেটিক কন্ট্রোল ও কল ভাইব্রেশন অ্যালার্টসহ নেকব্যান্ড",
    },
    description: {
      en: "A lightweight wireless neckband with magnetic earbuds, vibration on incoming calls and a voice-changer feature. Comfortable for long calls, workouts and commutes.",
      bn: "ম্যাগনেটিক ইয়ারবাড, ইনকামিং কলে ভাইব্রেশন ও ভয়েস চেঞ্জার ফিচারসহ হালকা ওয়্যারলেস নেকব্যান্ড। লম্বা কল, ব্যায়াম আর যাতায়াতে আরামদায়ক।",
    },
    images: ["gx-star-neckband.jpg"],
    price: 890,
    stockCount: 100,
    badge: { en: "PRE-ORDER", bn: "প্রি-অর্ডার" },
    specs: [
      { label: { en: "Model", bn: "মডেল" }, value: { en: "GX-Star", bn: "GX-Star" } },
      {
        label: { en: "Features", bn: "ফিচার" },
        value: {
          en: "Voice changer, call vibration, magnetic control",
          bn: "ভয়েস চেঞ্জার, কল ভাইব্রেশন, ম্যাগনেটিক কন্ট্রোল",
        },
      },
    ],
    preorder: {
      deliveryStart: "2026-10-14",
      deliveryEnd: "2026-10-20",
      expectedDelivery: { en: "October 14–20, 2026", bn: "১৪–২০ অক্টোবর, ২০২৬" },
      closesOn: "2026-10-10T23:59:59Z",
      preorderCloses: { en: "October 10, 2026", bn: "১০ অক্টোবর, ২০২৬" },
      maxQuantity: 200,
      currentQuantity: 83,
    },
  }),
  makeProduct({
    id: "preorder-04",
    slug: "airpods-pro-mini-fan-combo",
    sku: "PRE-KM-APFAN",
    category: "gadgets",
    name: { en: "Airpods Pro Earbuds + Mini Fan Combo", bn: "এয়ারপডস প্রো ইয়ারবাড + মিনি ফ্যান কম্বো" },
    tagline: {
      en: "Wireless earbuds bundled with a pocket phone fan",
      bn: "পকেট সাইজ ফোন ফ্যানের সাথে ওয়্যারলেস ইয়ারবাড কম্বো",
    },
    description: {
      en: "A wireless earbud set in a compact charging case, bundled with a small blue phone fan for hot days. Reserve now and we will confirm dispatch when stock arrives.",
      bn: "কমপ্যাক্ট চার্জিং কেসের ওয়্যারলেস ইয়ারবাডের সাথে গরমের দিনের জন্য ছোট নীল ফোন ফ্যান। এখনই রিজার্ভ করুন, স্টক এলে ডেলিভারির কথা জানানো হবে।",
    },
    images: ["airpods-pro-mini-fan.jpg"],
    price: 1590,
    stockCount: 100,
    badge: { en: "PRE-ORDER", bn: "প্রি-অর্ডার" },
    specs: [
      {
        label: { en: "In the box", bn: "বক্সে যা থাকছে" },
        value: { en: "Earbuds, charging case, mini fan", bn: "ইয়ারবাড, চার্জিং কেস, মিনি ফ্যান" },
      },
    ],
    preorder: {
      deliveryStart: "2026-10-16",
      deliveryEnd: "2026-10-22",
      expectedDelivery: { en: "October 16–22, 2026", bn: "১৬–২২ অক্টোবর, ২০২৬" },
      closesOn: "2026-10-12T23:59:59Z",
      preorderCloses: { en: "October 12, 2026", bn: "১২ অক্টোবর, ২০২৬" },
      maxQuantity: 100,
      currentQuantity: 31,
    },
  }),
];
