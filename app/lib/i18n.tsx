"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { taka } from "./format";
import type { Lang, T } from "./types";

interface LangContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (v: T | undefined) => string;
  ui: (k: keyof typeof DICT) => string;
  n: (v: number | string) => string;
  money: (v: number) => string;
}

const LangContext = createContext<LangContextType | null>(null);

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem("kullmart:lang");
    if (saved === "bn" || saved === "en") {
      setLangState(saved);
    }
  }, []);

  // The server always renders English (lang="en"); keep the document language in step with the toggle so screen
  // readers pick the right voice and the browser offers the right hyphenation and font fallbacks.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    window.localStorage.setItem("kullmart:lang", l);
  }, []);

  const t = useCallback(
    (v: T | undefined) => {
      if (!v) return "";
      return v[lang] || v.en || "";
    },
    [lang],
  );

  const ui = useCallback(
    (k: keyof typeof DICT) => {
      const entry = DICT[k];
      if (!entry) return k;
      return entry[lang] || entry.en;
    },
    [lang],
  );

  const n = useCallback(
    (v: number | string) => {
      if (lang === "bn") {
        return String(v).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d);
      }
      return String(v);
    },
    [lang],
  );

  const money = useCallback(
    (v: number) => {
      const formatted = taka(v);
      return lang === "bn"
        ? formatted.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d)
        : formatted;
    },
    [lang],
  );

  return (
    <LangContext.Provider value={{ lang, setLang, t, ui, n, money }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextType {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang must be used within LangProvider");
  }
  return ctx;
}

const DICT = {
  // Navigation
  navHome: { en: "Home", bn: "হোম" },
  navShop: { en: "Shop all", bn: "সব পণ্য" },
  navMenu: { en: "Menu", bn: "মেনু" },
  openMenu: { en: "Open menu", bn: "মেনু খুলুন" },
  closeMenu: { en: "Close menu", bn: "মেনু বন্ধ করুন" },
  shopByCategories: { en: "Shop by Categories", bn: "ক্যাটাগরি দেখুন" },
  browseAllCategories: { en: "Browse All", bn: "সব ক্যাটাগরি দেখুন" },
  navWishlist: { en: "Wishlist", bn: "উইশলিস্ট" },
  navSearch: { en: "Search", bn: "অনুসন্ধান" },
  searchPlaceholderShort: { en: "Search...", bn: "খুঁজুন..." },
  loading: { en: "Loading", bn: "লোড হচ্ছে" },
  navSearchPlaceholder: { en: "Search products, gadgets, bags, fashion...", bn: "পণ্য, গ্যাজেট বা ফ্যাশন খুঁজুন..." },
  matchingProducts: { en: "Matching Products", bn: "সম্পর্কিত পণ্যসমূহ" },
  viewAllResults: { en: "View all matching results", bn: "সব ফলাফল দেখুন" },

  // Sections
  featuredTitle: { en: "Trending right now", bn: "চলতি সপ্তাহের সেরা পছন্দ" },
  trendingNow: { en: "Trending now", bn: "চলতি ট্রেন্ড" },
  bestSellersTitle: { en: "Best seller collection", bn: "সেরা বিক্রিত কালেকশন" },
  categoriesTitle: { en: "Browse by category", bn: "ক্যাটাগরি অনুযায়ী দেখুন" },
  viewAllProducts: { en: "View all products", bn: "সব পণ্য দেখুন" },

  // Shop Page
  shopHeading: { en: "Shop all collections", bn: "আমাদের সব কালেকশন" },
  filterPriceRange: { en: "Price range", bn: "মূল্য পরিসীমা" },
  filterCatalog: { en: "Filter catalog", bn: "ফিল্টার ক্যাটালগ" },
  filterCategories: { en: "Categories", bn: "ক্যাটাগরি" },
  filterAllCollections: { en: "All items", bn: "সব আইটেম" },
  filterClearShort: { en: "Clear", bn: "মুছুন" },
  filterShowing: { en: "Showing", bn: "মোট দেখাচ্ছে" },
  sortLabel: { en: "Sort by", bn: "সাজান" },
  sortFeatured: { en: "Featured", bn: "জনপ্রিয়তা" },
  sortNewest: { en: "Newest arrivals", bn: "নতুন পণ্য" },
  sortPriceLow: { en: "Price: low to high", bn: "দাম: কম থেকে বেশি" },
  sortPriceHigh: { en: "Price: high to low", bn: "দাম: বেশি থেকে কম" },
  sortDiscount: { en: "Biggest discount", bn: "সর্বোচ্চ ছাড়" },
  sortNameAsc: { en: "Name: A–Z", bn: "নাম: ক–হ" },
  sortNameDesc: { en: "Name: Z–A", bn: "নাম: হ–ক" },
  filterInStockOnly: { en: "In stock only", bn: "শুধুমাত্র স্টকে থাকা পণ্য" },
  filterMobileToggle: { en: "Filters", bn: "ফিল্টার" },
  showProducts: { en: "Show products", bn: "পণ্য দেখুন" },
  filterAny: { en: "Any", bn: "যেকোনো" },
  itemsFound: { en: "products found", bn: "টি পণ্য পাওয়া গেছে" },
  noProductsFound: { en: "No products matched your filters.", bn: "কোনো পণ্য খুঁজে পাওয়া যায়নি।" },
  resetFilters: { en: "Reset all filters", bn: "ফিল্টার রিসেট করুন" },

  // Product Card & Detail
  addToCart: { en: "Add to bag", bn: "ব্যাগে নিন" },
  buyNow: { en: "Buy now", bn: "এখনই অর্ডার করুন" },
  inStock: { en: "In stock", bn: "স্টকে আছে" },
  off: { en: "off", bn: "ছাড়" },
  category: { en: "Category", bn: "ক্যাটাগরি" },
  description: { en: "Description", bn: "বিবরণ" },
  specifications: { en: "Specifications", bn: "বৈশিষ্ট্য ও বিবরণ" },
  highlights: { en: "Product highlights", bn: "মূল সুবিধাসমূহ" },
  relatedProducts: { en: "You may also like", bn: "সম্পর্কিত অন্যান্য পণ্য" },
  // Pre-order system
  navPreOrder: { en: "Pre-order", bn: "প্রি-অর্ডার" },
  preOrderNow: { en: "Pre-order Now", bn: "প্রি-অর্ডার করুন" },
  preOrderUnavailable: { en: "Pre-order unavailable", bn: "প্রি-অর্ডার সমাপ্ত" },
  preOrderSoldOut: { en: "PRE-ORDER SOLD OUT", bn: "প্রি-অর্ডার স্টক শেষ" },
  preOrderClosingSoon: { en: "Closing soon", bn: "শীঘ্রই শেষ হবে" },
  preOrderCapacityReached: { en: "Pre-order capacity has been reached.", bn: "প্রি-অর্ডারের সর্বোচ্চ সীমা পূর্ণ হয়েছে।" },
  expectedDelivery: { en: "Expected delivery", bn: "সম্ভাব্য ডেলিভারি" },
  preOrderCloses: { en: "Pre-order closes", bn: "প্রি-অর্ডার শেষ হবে" },
  preOrderEndsIn: { en: "Pre-order ends in", bn: "প্রি-অর্ডার শেষ হতে বাকি" },
  preOrderInfoTitle: { en: "Pre-order information", bn: "প্রি-অর্ডার সংক্রান্ত তথ্য" },
  preOrderInfo1: { en: "Reserve your product before regular stock arrives", bn: "সাধারণ স্টক আসার আগেই পণ্যটি নিশ্চিত বুকিং করুন" },
  preOrderInfo2: { en: "Expected delivery", bn: "সম্ভাব্য ডেলিভারির তারিখ" },
  preOrderInfo3: { en: "We will contact you about your order", bn: "অর্ডার সম্পর্কে আমরা আপনার সাথে যোগাযোগ করব" },
  preOrderInfo4: { en: "Delivery dates may change depending on stock arrival", bn: "স্টক আসার সময়ের উপর নির্ভর করে ডেলিভারির তারিখ পরিবর্তিত হতে পারে" },
  confirmPreOrder: { en: "Confirm pre-order", bn: "প্রি-অর্ডার নিশ্চিতকরণ" },
  confirmPreOrderNotice: { en: "This is a pre-order item. It will be shipped after stock arrives.", bn: "এটি একটি প্রি-অর্ডার পণ্য। স্টক পৌঁছানোর পর এটি আপনার ঠিকানায় পাঠিয়ে দেওয়া হবে।" },
  cancel: { en: "Cancel", bn: "বাতিল" },
  confirmPreOrderBtn: { en: "Confirm Pre-order", bn: "প্রি-অর্ডার নিশ্চিত করুন" },
  checkoutPreOrderNotice: { en: "This order contains a pre-order product.", bn: "এই অর্ডারে প্রি-অর্ডার পণ্য রয়েছে।" },
  checkoutPreOrderShipping: { en: "The product will be shipped after stock arrives.", bn: "স্টক পৌঁছানোর পর পণ্যটি ডেলিভারি করা হবে।" },
  backToShopping: { en: "Back to shopping", bn: "কেনাকাটায় ফিরে যান" },

  // Cart Drawer
  cartTitle: { en: "Your shopping bag", bn: "আপনার শপিং ব্যাগ" },
  cartEmptyTitle: { en: "Your cart is currently empty", bn: "আপনার ব্যাগ এখন খালি" },
  cartEmptySubtitle: {
    en: "Discover our gadgets, bags, jewellery and everyday fashion.",
    bn: "গ্যাজেটস, ব্যাগ, জুয়েলারি আর নিত্যদিনের ফ্যাশন থেকে পছন্দের পণ্য বেছে নিয়ে ব্যাগে যোগ করুন।",
  },
  cartStartShopping: { en: "Start shopping", bn: "কেনাকাটা শুরু করুন" },
  cartSubtotal: { en: "Subtotal", bn: "উপমোট" },
  cartDeliveryFree: { en: "Free", bn: "ফ্রি" },
  cartProceedToCheckout: { en: "Proceed to checkout", bn: "চেকআউটে এগিয়ে যান" },
  cartRemove: { en: "Remove", bn: "মুছুন" },
  cartPreOrderNotice: {
    en: "This item is a pre-order and will be shipped once available.",
    bn: "এটি একটি প্রি-অর্ডার পণ্য এবং স্টক আসার সাথে সাথে পাঠানো হবে।",
  },
  cartMixedNotice: {
    en: "Note: Your order contains pre-order items. Items may ship separately or together depending on availability.",
    bn: "বিশেষ দ্রষ্টব্য: আপনার অর্ডারে প্রি-অর্ডার পণ্য রয়েছে। প্রাপ্যতা অনুযায়ী আইটেমগুলো একসাথে বা পৃথকভাবে পাঠানো হতে পারে।",
  },

  // Wishlist Drawer
  wishlistTitle: { en: "My wishlist", bn: "আমার পছন্দের তালিকা" },
  wishlistEmptyTitle: { en: "Your wishlist is empty", bn: "আপনার পছন্দের তালিকা ফাঁকা" },
  wishlistEmptySubtitle: {
    en: "Save items you love to find them easily later or move them to cart.",
    bn: "আপনার প্রিয় পণ্যগুলো সেভ করে রাখুন যাতে পরে সহজে খুঁজে পেতে পারেন।",
  },
  wishlistMoveToCart: { en: "Move to bag", bn: "ব্যাগে নিন" },
  wishlistClear: { en: "Clear all", bn: "সব মুছুন" },

  // Checkout Page
  checkoutTitle: { en: "Complete your order", bn: "অর্ডার সম্পন্ন করুন" },
  checkoutContactInfo: { en: "Contact information", bn: "আপনার তথ্য" },
  checkoutFullName: { en: "Full name", bn: "আপনার পুরো নাম" },
  checkoutFullNamePlaceholder: { en: "Enter your full name", bn: "আপনার পুরো নাম লিখুন" },
  checkoutPhone: { en: "Mobile phone number", bn: "মোবাইল নম্বর" },
  checkoutAddress: { en: "Delivery address", bn: "ডেলিভারি ঠিকানা" },
  checkoutAddressPlaceholder: {
    en: "House, road, village, area, thana",
    bn: "বাসা, সড়ক, গ্রাম, থানা, পোস্ট কোড",
  },
  checkoutCity: { en: "District / city", bn: "জেলা / শহর" },
  checkoutDeliveryNotes: { en: "Special notes (optional)", bn: "বিশেষ কোনো নির্দেশনা (ঐচ্ছিক)" },
  checkoutDeliveryNotesPlaceholder: {
    en: "Any instructions for the delivery rider...",
    bn: "ডেলিভারিম্যানের জন্য কোনো নির্দেশনা থাকলে লিখুন...",
  },
  checkoutPaymentMethod: { en: "Payment method", bn: "পেমেন্ট মাধ্যম" },
  checkoutCodLabel: { en: "Cash on delivery", bn: "ক্যাশ অন ডেলিভারি" },
  checkoutCodSub: {
    en: "Pay with cash after checking parcel at your door",
    bn: "পণ্য হাতে পেয়ে দেখে টাকা দিন",
  },
  checkoutOrderSummary: { en: "Order summary", bn: "অর্ডার বিবরণী" },
  checkoutItemsTotal: { en: "Items total", bn: "পণ্যের মূল্য" },
  checkoutShippingFee: { en: "Shipping fee", bn: "ডেলিভারি চার্জ" },
  checkoutGrandTotal: { en: "Total amount", bn: "সর্বমোট" },
  checkoutPlaceOrderBtn: { en: "Confirm order", bn: "অর্ডার নিশ্চিত করুন" },
  checkoutPlacing: { en: "Processing order...", bn: "অর্ডার তৈরি হচ্ছে..." },
  checkoutValidationAlert: {
    en: "Please provide your name, valid mobile number, and address.",
    bn: "দয়া করে আপনার নাম, সঠিক মোবাইল নম্বর এবং ঠিকানা পূরণ করুন।",
  },

  // Order Success Screen
  orderSuccessTitle: { en: "Order placed successfully!", bn: "আপনার অর্ডারটি সফল হয়েছে!" },
  orderSuccessSubtitle: {
    en: "Thank you for shopping with Kull Mart. We will contact you shortly to confirm your order and dispatch.",
    bn: "কুল মার্ট থেকে অর্ডার করার জন্য ধন্যবাদ। পার্সেল পাঠানোর আগে যোগাযোগ করে অর্ডার কনফার্ম করা হবে।",
  },
  orderNumberLabel: { en: "Order ID", bn: "অর্ডার আইডি" },
  orderWhatsappConfirm: { en: "Confirm on WhatsApp", bn: "হোয়াটসঅ্যাপে নিশ্চিত করুন" },
  orderCallStore: { en: "Call store directly", bn: "সরাসরি স্টোরে কল করুন" },
  orderContinueShopping: { en: "Continue shopping", bn: "আরও কেনাকাটা করুন" },

  // Newsletter
  newsletterTitle: { en: "Join the Kull Mart list", bn: "কুল মার্টের সাথে যুক্ত থাকুন" },
  newsletterSubtitle: {
    en: "Be first to hear about new arrivals, restocks and special offers.",
    bn: "নতুন পণ্য, রিস্টক আর বিশেষ অফারের আপডেট সবার আগে পান।",
  },
  newsletterPlaceholder: { en: "Enter your mobile or email", bn: "আপনার মোবাইল বা ইমেইল লিখুন" },
  newsletterButton: { en: "Subscribe", bn: "যুক্ত হোন" },
  newsletterSuccess: {
    en: "Thank you for subscribing!",
    bn: "ধন্যবাদ! আপনি সফলভাবে যুক্ত হয়েছেন।",
  },

  // Footer
  footerAboutText: {
    en: "Kull Mart is a Dhaka-based store for women's fashion, innerwear, kids' items and gadgets — wholesale and retail, with delivery all across Bangladesh.",
    bn: "কুল মার্ট — ঢাকাভিত্তিক নারীদের ফ্যাশন, ইনারওয়্যার, কিডস আইটেম ও গ্যাজেটসের দোকান। পাইকারি ও খুচরা, সারা বাংলাদেশে ডেলিভারি।",
  },
  footerQuickLinks: { en: "Quick links", bn: "প্রয়োজনীয় লিংক" },
  footerCategories: { en: "Categories", bn: "ক্যাটাগরি" },
  footerContactUs: { en: "Store contact", bn: "যোগাযোগের ঠিকানা" },
  footerHours: { en: "Always open for online orders", bn: "অনলাইন অর্ডারের জন্য সবসময় খোলা" },
  footerRights: { en: "All rights reserved.", bn: "সর্বস্বত্ব সংরক্ষিত।" },
  footerDisclaimer: {
    en: "Brand name, logo, contact details and product photographs belong to Kull Mart. Prices, stock counts and pre-order dates on this site are sample values until confirmed by the store.",
    bn: "ব্র্যান্ড নাম, লোগো, যোগাযোগের তথ্য ও পণ্যের ছবি কুল মার্টের নিজস্ব। এই সাইটের দাম, স্টক সংখ্যা ও প্রি-অর্ডারের তারিখ দোকান নিশ্চিত না করা পর্যন্ত নমুনা মান।",
  },
} satisfies Record<string, T>;
