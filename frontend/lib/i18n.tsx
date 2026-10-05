"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { taka } from "@/lib/format";
import type { Lang, T } from "@/lib/types";

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
      return lang === "bn" ? formatted.replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)] ?? d) : formatted;
    },
    [lang],
  );

  return <LangContext.Provider value={{ lang, setLang, t, ui, n, money }}>{children}</LangContext.Provider>;
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
  shopByCategories: { en: "Shop by category", bn: "ক্যাটাগরি দেখুন" },
  browseAllCategories: { en: "Browse all", bn: "সব ক্যাটাগরি দেখুন" },
  navWishlist: { en: "Wishlist", bn: "উইশলিস্ট" },
  navProfile: { en: "Profile", bn: "প্রোফাইল" },
  tabShop: { en: "Shop", bn: "শপ" },
  tabTrack: { en: "Track", bn: "ট্র্যাক" },
  messageUs: { en: "Message us", bn: "মেসেজ করুন" },
  loginTitle: { en: "Log in", bn: "লগ ইন" },
  loginSubtitle: { en: "Welcome back to Kull Mart", bn: "কুল মার্টে আবার স্বাগতম" },
  loginIdentifierLabel: { en: "Email", bn: "ইমেইল" },
  loginIdentifierPlaceholder: { en: "you@example.com", bn: "you@example.com" },
  loginPasswordLabel: { en: "Password", bn: "পাসওয়ার্ড" },
  loginShowPassword: { en: "Show password", bn: "পাসওয়ার্ড দেখান" },
  loginHidePassword: { en: "Hide password", bn: "পাসওয়ার্ড লুকান" },
  loginSubmit: { en: "Log in", bn: "লগ ইন করুন" },
  loginValidation: {
    en: "Please enter your email and password.",
    bn: "অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড দিন।",
  },
  loginInvalid: { en: "Wrong email or password.", bn: "ইমেইল বা পাসওয়ার্ড ভুল।" },
  loginForgot: {
    en: "Forgot your password? Message us and we will help you reset it.",
    bn: "পাসওয়ার্ড ভুলে গেছেন? আমাদের মেসেজ করুন, রিসেট করতে সাহায্য করব।",
  },
  accountWelcome: { en: "Welcome back", bn: "আবার স্বাগতম" },
  accountLogout: { en: "Log out", bn: "লগ আউট" },
  ordersTitle: { en: "My orders", bn: "আমার অর্ডার" },
  ordersEmpty: {
    en: "You have no orders yet. Orders you place while logged in will appear here.",
    bn: "এখনও কোনো অর্ডার নেই। লগ ইন অবস্থায় করা অর্ডার এখানে দেখা যাবে।",
  },
  ordersTotal: { en: "Total", bn: "মোট" },
  ordersTrack: { en: "Track order", bn: "অর্ডার ট্র্যাক করুন" },
  orderStatusAwaitingPayment: { en: "Awaiting payment", bn: "পেমেন্টের অপেক্ষায়" },
  orderStatusConfirmed: { en: "Confirmed", bn: "নিশ্চিত" },
  orderStatusShipped: { en: "Shipped", bn: "পাঠানো হয়েছে" },
  orderStatusDelivered: { en: "Delivered", bn: "ডেলিভারি হয়েছে" },
  orderStatusClosed: { en: "Completed", bn: "সম্পন্ন" },
  orderStatusCancelled: { en: "Cancelled", bn: "বাতিল" },
  accountStaffNote: {
    en: "This is a staff account. Asking questions and reporting prices need a customer account.",
    bn: "এটি স্টাফ অ্যাকাউন্ট। প্রশ্ন করা ও দাম রিপোর্ট করতে কাস্টমার অ্যাকাউন্ট লাগবে।",
  },
  errTooMany: {
    en: "Too many attempts. Please wait a little and try again.",
    bn: "অনেকবার চেষ্টা করা হয়েছে। একটু পরে আবার চেষ্টা করুন।",
  },
  registerEmailLabel: { en: "Email", bn: "ইমেইল" },
  registerEmailSuggestion: { en: "Did you mean", bn: "আপনি কি লিখতে চেয়েছিলেন" },
  registerEmailUse: { en: "Yes, use this email", bn: "হ্যাঁ, এই ইমেইল ব্যবহার করুন" },
  registerEmailKeep: {
    en: "If your email is already correct, press Create account again.",
    bn: "ইমেইল ঠিক থাকলে আবার অ্যাকাউন্ট তৈরি করুন চাপুন।",
  },
  registerPasswordShort: {
    en: "The password needs at least 8 characters.",
    bn: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।",
  },
  registerTitle: { en: "Register", bn: "রেজিস্টার" },
  registerSubtitle: { en: "Create your Kull Mart account", bn: "আপনার কুল মার্ট অ্যাকাউন্ট তৈরি করুন" },
  registerNameLabel: { en: "Full name", bn: "পুরো নাম" },
  registerPhoneLabel: { en: "Phone number", bn: "ফোন নম্বর" },
  registerConfirmLabel: { en: "Confirm password", bn: "পাসওয়ার্ড নিশ্চিত করুন" },
  registerSubmit: { en: "Create account", bn: "অ্যাকাউন্ট তৈরি করুন" },
  registerValidation: { en: "Please fill in all fields.", bn: "অনুগ্রহ করে সব ঘর পূরণ করুন।" },
  registerMismatch: { en: "Passwords do not match.", bn: "পাসওয়ার্ড মিলছে না।" },
  registerHaveAccount: { en: "Already have an account? Log in", bn: "আগেই অ্যাকাউন্ট আছে? লগ ইন করুন" },
  loginNoAccount: { en: "New here? Register", bn: "নতুন? রেজিস্টার করুন" },
  voucherTitle: { en: "Collect vouchers", bn: "ভাউচার সংগ্রহ করুন" },
  voucherCollect: { en: "Collect", bn: "সংগ্রহ" },
  voucherCollected: { en: "Collected", bn: "সংগৃহীত" },
  voucherOff: { en: "OFF", bn: "ছাড়" },
  voucherMinSpend: { en: "Min. spend", bn: "সর্বনিম্ন খরচ" },
  voucherNoMinSpend: { en: "No minimum spend", bn: "সর্বনিম্ন খরচ নেই" },
  voucherCode: { en: "Code", bn: "কোড" },
  loginContinueShopping: { en: "Continue shopping", bn: "কেনাকাটা চালিয়ে যান" },
  navSearch: { en: "Search", bn: "অনুসন্ধান" },
  loading: { en: "Loading", bn: "লোড হচ্ছে" },
  searchPlaceholder: { en: "Search products…", bn: "পণ্য খুঁজুন…" },
  searchProducts: { en: "Search products", bn: "পণ্য খুঁজুন" },
  clearSearch: { en: "Clear search", bn: "লেখা মুছুন" },
  matchingProducts: { en: "Matching products", bn: "সম্পর্কিত পণ্যসমূহ" },
  viewAllResults: { en: "View all matching results", bn: "সব ফলাফল দেখুন" },

  // Hero
  heroCategoriesTitle: { en: "Shop by Category", bn: "ক্যাটাগরি দেখুন" },
  heroWelcomeTitle: { en: "Welcome to Kull Mart", bn: "কুল মার্টে স্বাগতম" },
  heroWelcomeSubtitle: {
    en: "Women's fashion, innerwear, kids & gadgets",
    bn: "নারীদের ফ্যাশন, ইনারওয়্যার, কিডস ও গ্যাজেটস",
  },
  heroShopNow: { en: "Shop now", bn: "কিনুন" },
  heroWhatsapp: { en: "WhatsApp us", bn: "হোয়াটসঅ্যাপ করুন" },
  heroFeaturedTitle: { en: "Featured product", bn: "ফিচারড পণ্য" },
  heroFeaturedSubtitle: { en: "Don't miss out", bn: "মিস করবেন না" },
  heroPreorderTitle: { en: "Preorder", bn: "প্রি-অর্ডার" },
  heroPreorderSubtitle: { en: "Reserve yours early", bn: "আগেভাগে বুক করুন" },
  heroPromotionTitle: { en: "Promotion", bn: "প্রমোশন" },
  heroPromotionSubtitle: { en: "Special offers", bn: "বিশেষ অফার" },

  // Sections
  featuredTitle: { en: "Trending right now", bn: "চলতি সপ্তাহের সেরা পছন্দ" },
  trendingNow: { en: "Trending now", bn: "চলতি ট্রেন্ড" },
  bestSellersTitle: { en: "Best seller collection", bn: "সেরা বিক্রিত কালেকশন" },
  categoriesTitle: { en: "Browse by category", bn: "ক্যাটাগরি অনুযায়ী দেখুন" },
  viewAllProducts: { en: "View all", bn: "সব দেখুন" },
  loadMore: { en: "Load more", bn: "আরও দেখুন" },

  // Shop Page
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
  addToCart: { en: "Add to cart", bn: "কার্টে নিন" },
  buyNow: { en: "Buy now", bn: "এখনই অর্ডার করুন" },
  productCode: { en: "Code", bn: "কোড" },
  inStock: { en: "In stock", bn: "স্টকে আছে" },
  off: { en: "off", bn: "ছাড়" },
  category: { en: "Category", bn: "ক্যাটাগরি" },
  description: { en: "Description", bn: "বিবরণ" },
  specifications: { en: "Specifications", bn: "বৈশিষ্ট্য ও বিবরণ" },
  highlights: { en: "Product highlights", bn: "মূল সুবিধাসমূহ" },
  relatedProducts: { en: "You may also like", bn: "সম্পর্কিত অন্যান্য পণ্য" },
  // Product page accordions
  loadFailed: { en: "This could not be loaded. Please try again.", bn: "লোড করা যায়নি। আবার চেষ্টা করুন।" },
  reviewsTitle: { en: "Verified customer reviews", bn: "ভেরিফায়েড ক্রেতাদের রিভিউ" },
  reviewsEmpty: {
    en: "No reviews yet. Customers who have received this product can review it.",
    bn: "এখনও কোনো রিভিউ নেই। যারা পণ্যটি হাতে পেয়েছেন তারা রিভিউ দিতে পারবেন।",
  },
  reviewsVerified: { en: "Verified purchase", bn: "ভেরিফায়েড ক্রয়" },
  reviewsOutOfFive: { en: "out of 5", bn: "৫-এর মধ্যে" },
  reviewsWriteTitle: { en: "Write a review", bn: "রিভিউ লিখুন" },
  reviewsRatingLabel: { en: "Your rating", bn: "আপনার রেটিং" },
  reviewsStars: { en: "stars", bn: "তারা" },
  reviewsRatingRequired: { en: "Please choose a star rating.", bn: "অনুগ্রহ করে রেটিং দিন।" },
  reviewsCommentLabel: { en: "Your review (optional)", bn: "আপনার রিভিউ (ঐচ্ছিক)" },
  reviewsCommentPlaceholder: {
    en: "How was the quality, fit and delivery?",
    bn: "পণ্যের মান, ফিটিং ও ডেলিভারি কেমন ছিল?",
  },
  reviewsSubmit: { en: "Post review", bn: "রিভিউ দিন" },
  reviewsSent: { en: "Thank you! Your review has been posted.", bn: "ধন্যবাদ! আপনার রিভিউ প্রকাশিত হয়েছে।" },
  reviewsDuplicate: { en: "You have already reviewed this product.", bn: "আপনি এই পণ্যের রিভিউ আগেই দিয়েছেন।" },
  reviewsPurchaseRequired: {
    en: "You can review this product once your order of it has been delivered.",
    bn: "এই পণ্যের অর্ডার ডেলিভারি পাওয়ার পর রিভিউ দিতে পারবেন।",
  },
  reviewsLogin: { en: "Log in to write a review", bn: "রিভিউ লিখতে লগ ইন করুন" },
  questionsTitle: { en: "Ask a question", bn: "প্রশ্ন করুন" },
  questionsEmpty: {
    en: "No questions answered yet. Be the first to ask.",
    bn: "এখনও কোনো প্রশ্নের উত্তর দেওয়া হয়নি। প্রথম প্রশ্নটি আপনিই করুন।",
  },
  questionsQ: { en: "Q", bn: "প্র" },
  questionsA: { en: "A", bn: "উ" },
  questionsLabel: { en: "Your question", bn: "আপনার প্রশ্ন" },
  questionsPlaceholder: {
    en: "Ask about size, colour, material or delivery…",
    bn: "সাইজ, রং, ম্যাটেরিয়াল বা ডেলিভারি নিয়ে জিজ্ঞেস করুন…",
  },
  questionsSubmit: { en: "Send question", bn: "প্রশ্ন পাঠান" },
  questionsRequired: { en: "Please write your question.", bn: "অনুগ্রহ করে প্রশ্নটি লিখুন।" },
  questionsSent: {
    en: "Thank you! Your question has been sent. It will appear here once we answer it.",
    bn: "ধন্যবাদ! আপনার প্রশ্ন পাঠানো হয়েছে। উত্তর দেওয়ার পর এটি এখানে দেখা যাবে।",
  },
  questionsDuplicate: {
    en: "You have already asked this question about this product.",
    bn: "এই পণ্য নিয়ে আপনি এই প্রশ্নটি আগেই করেছেন।",
  },
  questionsLogin: { en: "Log in to ask a question", bn: "প্রশ্ন করতে লগ ইন করুন" },
  priceReportTitle: { en: "Report a price issue", bn: "দামের সমস্যা জানান" },
  priceReportIntro: {
    en: "Seen this cheaper elsewhere, or does the price look wrong? Tell us and we will check it.",
    bn: "অন্য কোথাও কম দামে দেখেছেন, বা দাম ভুল মনে হচ্ছে? আমাদের জানান, আমরা যাচাই করব।",
  },
  priceReportCurrent: { en: "Current price", bn: "বর্তমান দাম" },
  priceReportExpected: { en: "Price you expected (৳)", bn: "আপনার প্রত্যাশিত দাম (৳)" },
  priceReportComment: { en: "Details", bn: "বিস্তারিত" },
  priceReportCommentPlaceholder: {
    en: "Where did you see the other price? Anything else we should know?",
    bn: "অন্য দামটি কোথায় দেখেছেন? আর কিছু জানাতে চান?",
  },
  priceReportSubmit: { en: "Send report", bn: "রিপোর্ট পাঠান" },
  priceReportRequired: {
    en: "Give the price you expected or describe the problem.",
    bn: "প্রত্যাশিত দাম দিন অথবা সমস্যাটি লিখুন।",
  },
  priceReportInvalidPrice: { en: "Enter a price above zero.", bn: "শূন্যের বেশি একটি দাম দিন।" },
  priceReportSent: {
    en: "Thank you! We have received your report and will review the price.",
    bn: "ধন্যবাদ! আপনার রিপোর্ট পেয়েছি, দামটি যাচাই করে দেখব।",
  },
  priceReportDuplicate: {
    en: "You already have an open report for this product. We are looking into it.",
    bn: "এই পণ্যের জন্য আপনার একটি রিপোর্ট আগে থেকেই আছে। আমরা দেখছি।",
  },
  priceReportLogin: { en: "Log in to report a price issue", bn: "দামের সমস্যা জানাতে লগ ইন করুন" },
  customerOnly: {
    en: "Only customer accounts can do this.",
    bn: "এটি শুধু কাস্টমার অ্যাকাউন্ট থেকে করা যাবে।",
  },
  shareTitle: { en: "Share & recommend", bn: "শেয়ার ও রেকমেন্ড" },
  shareIntro: {
    en: "Know someone who would like this? Send it to them.",
    bn: "কারও এটি পছন্দ হতে পারে মনে হচ্ছে? তাকে পাঠিয়ে দিন।",
  },
  shareWhatsApp: { en: "WhatsApp", bn: "হোয়াটসঅ্যাপ" },
  shareFacebook: { en: "Facebook", bn: "ফেসবুক" },
  shareCopy: { en: "Copy link", bn: "লিংক কপি করুন" },
  shareCopied: { en: "Link copied", bn: "লিংক কপি হয়েছে" },
  shareMore: { en: "More", bn: "আরও" },
  shareMessage: { en: "Have a look at this on Kull Mart:", bn: "কুল মার্টে এটি দেখুন:" },
  policyReturnWindow: { en: "Returns are accepted within", bn: "রিটার্ন করা যাবে" },
  policyReturnWindowDays: { en: "days of delivery.", bn: "দিনের মধ্যে (ডেলিভারির পর থেকে)।" },
  policyReadFull: { en: "Read the full return policy", bn: "সম্পূর্ণ রিটার্ন নীতি পড়ুন" },
  // Pre-order system
  navPreOrder: { en: "Pre-order", bn: "প্রি-অর্ডার" },
  preOrderEmpty: { en: "No pre-order products right now.", bn: "এখন কোনো প্রি-অর্ডার পণ্য নেই।" },
  preOrderNow: { en: "Pre-order now", bn: "প্রি-অর্ডার করুন" },
  preOrderUnavailable: { en: "Pre-order unavailable", bn: "প্রি-অর্ডার সমাপ্ত" },
  preOrderSoldOut: { en: "Pre-order sold out", bn: "প্রি-অর্ডার স্টক শেষ" },
  preOrderClosingSoon: { en: "Closing soon", bn: "শীঘ্রই শেষ হবে" },
  preOrderBadge: { en: "Pre-order", bn: "প্রি-অর্ডার" },
  preOrderOpen: { en: "Pre-order open", bn: "প্রি-অর্ডার চলছে" },
  preOrderCapacityReached: {
    en: "Pre-order capacity has been reached.",
    bn: "প্রি-অর্ডারের সর্বোচ্চ সীমা পূর্ণ হয়েছে।",
  },
  expectedDelivery: { en: "Expected delivery", bn: "সম্ভাব্য ডেলিভারি" },
  preOrderCloses: { en: "Pre-order closes", bn: "প্রি-অর্ডার শেষ হবে" },
  preOrderEndsIn: { en: "Pre-order ends in", bn: "প্রি-অর্ডার শেষ হতে বাকি" },
  preOrderInfoTitle: { en: "Pre-order information", bn: "প্রি-অর্ডার সংক্রান্ত তথ্য" },
  preOrderInfo1: {
    en: "Reserve your product before regular stock arrives",
    bn: "সাধারণ স্টক আসার আগেই পণ্যটি নিশ্চিত বুকিং করুন",
  },
  preOrderInfo2: { en: "Expected delivery", bn: "সম্ভাব্য ডেলিভারির তারিখ" },
  deliveryDateTbc: { en: "Date to be confirmed", bn: "তারিখ এখনো ঠিক হয়নি" },
  preOrderInfo3: { en: "We will contact you about your order", bn: "অর্ডার সম্পর্কে আমরা আপনার সাথে যোগাযোগ করব" },
  preOrderInfo4: {
    en: "Delivery dates may change depending on stock arrival",
    bn: "স্টক আসার সময়ের উপর নির্ভর করে ডেলিভারির তারিখ পরিবর্তিত হতে পারে",
  },
  confirmPreOrder: { en: "Confirm pre-order", bn: "প্রি-অর্ডার নিশ্চিতকরণ" },
  confirmPreOrderNotice: {
    en: "This is a pre-order item. It will be shipped after stock arrives.",
    bn: "এটি একটি প্রি-অর্ডার পণ্য। স্টক পৌঁছানোর পর এটি আপনার ঠিকানায় পাঠিয়ে দেওয়া হবে।",
  },
  cancel: { en: "Cancel", bn: "বাতিল" },
  confirmPreOrderBtn: { en: "Confirm pre-order", bn: "প্রি-অর্ডার নিশ্চিত করুন" },
  checkoutPreOrderNotice: { en: "This order contains a pre-order product.", bn: "এই অর্ডারে প্রি-অর্ডার পণ্য রয়েছে।" },
  checkoutPreOrderShipping: {
    en: "The product will be shipped after stock arrives.",
    bn: "স্টক পৌঁছানোর পর পণ্যটি ডেলিভারি করা হবে।",
  },
  backToShopping: { en: "Back to shopping", bn: "কেনাকাটায় ফিরে যান" },

  // Cart Drawer
  cartTitle: { en: "Your shopping cart", bn: "আপনার শপিং কার্ট" },
  cartEmptyTitle: { en: "Your cart is currently empty", bn: "আপনার ব্যাগ এখন খালি" },
  cartEmptySubtitle: {
    en: "Browse the shop to find something you like.",
    bn: "সব পণ্য ঘুরে দেখুন, পছন্দেরটা কার্টে নিন।",
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
  wishlistMoveToCart: { en: "Move to cart", bn: "কার্টে নিন" },
  wishlistClear: { en: "Clear all", bn: "সব মুছুন" },
  wishlistMoveAllToCart: { en: "Move all to cart", bn: "সবগুলো কার্টে নিন" },

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
  payCash: { en: "Cash", bn: "ক্যাশ" },
  payCard: { en: "Card", bn: "কার্ড" },
  payBkash: { en: "bKash", bn: "বিকাশ" },
  payNagad: { en: "Nagad", bn: "নগদ" },
  payRocket: { en: "Rocket", bn: "রকেট" },
  payBankTransfer: { en: "Bank transfer", bn: "ব্যাংক ট্রান্সফার" },
  payManual: { en: "Manual / other", bn: "অন্য উপায়" },
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

  // Track Order
  navTrackOrder: { en: "Track order", bn: "অর্ডার ট্র্যাক করুন" },
  trackOrderTitle: { en: "Track your order", bn: "আপনার অর্ডার ট্র্যাক করুন" },
  trackOrderNumberPlaceholder: { en: "Your order number", bn: "আপনার অর্ডার নম্বর" },
  trackOrderSubmit: { en: "Track order", bn: "অর্ডার ট্র্যাক করুন" },
  trackOrderValidation: {
    en: "Please enter both your order number and phone number.",
    bn: "অনুগ্রহ করে অর্ডার নম্বর ও মোবাইল নম্বর উভয়ই দিন।",
  },
  trackOrderNotFound: { en: "Order not found", bn: "অর্ডার খুঁজে পাওয়া যায়নি" },
  trackOrderPlacedOn: { en: "Order placed", bn: "অর্ডার করা হয়েছে" },
  trackOrderEstDelivery: { en: "Estimated delivery", bn: "সম্ভাব্য ডেলিভারি" },
  trackOrderCurrentStatus: { en: "Current status", bn: "বর্তমান অবস্থা" },
  trackStagePlaced: { en: "Order placed", bn: "অর্ডার সম্পন্ন হয়েছে" },
  trackStageConfirmed: { en: "Order confirmed", bn: "অর্ডার নিশ্চিত হয়েছে" },
  trackStagePacked: { en: "Packed", bn: "প্যাক করা হয়েছে" },
  trackStageShipped: { en: "Shipped", bn: "শিপ করা হয়েছে" },
  trackStageDelivered: { en: "Delivered", bn: "ডেলিভারি সম্পন্ন" },
  trackOrderHelpTitle: { en: "Need help with this order?", bn: "এই অর্ডার নিয়ে সাহায্য দরকার?" },
  trackOrderDisclaimer: {
    en: "Status shown is our best estimate. For exact updates, message or call us anytime.",
    bn: "প্রদর্শিত অবস্থা আনুমানিক। সঠিক তথ্যের জন্য যেকোনো সময় আমাদের মেসেজ বা কল করুন।",
  },
  trackOrderSearchAnother: { en: "Track another order", bn: "অন্য অর্ডার ট্র্যাক করুন" },

  // Newsletter
  newsletterTitle: { en: "Join the Kull Mart list", bn: "কুল মার্টের সাথে যুক্ত থাকুন" },
  newsletterSubtitle: {
    en: "Be first to hear about new arrivals, restocks and special offers.",
    bn: "নতুন পণ্য, রিস্টক আর বিশেষ অফারের আপডেট সবার আগে পান।",
  },
  newsletterPlaceholder: { en: "Enter your email", bn: "আপনার ইমেইল লিখুন" },
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
  footerReturnPolicy: { en: "Return policy", bn: "রিটার্ন নীতি" },
  footerRefundPolicy: { en: "Refund policy", bn: "রিফান্ড নীতি" },
  footerHours: { en: "Always open for online orders", bn: "অনলাইন অর্ডারের জন্য সবসময় খোলা" },
  footerRights: { en: "All rights reserved.", bn: "সর্বস্বত্ব সংরক্ষিত।" },
  footerDisclaimer: {
    en: "Brand name, logo, contact details and product photographs belong to Kull Mart. Prices, stock counts and pre-order dates on this site are sample values until confirmed by the store.",
    bn: "ব্র্যান্ড নাম, লোগো, যোগাযোগের তথ্য ও পণ্যের ছবি কুল মার্টের নিজস্ব। এই সাইটের দাম, স্টক সংখ্যা ও প্রি-অর্ডারের তারিখ দোকান নিশ্চিত না করা পর্যন্ত নমুনা মান।",
  },
  // API errors and states
  errNetwork: {
    en: "We couldn't reach the store server. Please check your connection and try again.",
    bn: "স্টোর সার্ভারের সাথে যোগাযোগ করা যাচ্ছে না। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।",
  },
  errNotFound: { en: "We couldn't find what you were looking for.", bn: "আপনি যা খুঁজছেন তা পাওয়া যায়নি।" },
  errServer: {
    en: "The store is having trouble right now. Please try again in a moment.",
    bn: "স্টোরে এই মুহূর্তে সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করুন।",
  },
  errValidation: {
    en: "Please check the highlighted fields and try again.",
    bn: "চিহ্নিত ঘরগুলো দেখে আবার চেষ্টা করুন।",
  },
  errGeneric: { en: "Something went wrong. Please try again.", bn: "কিছু একটা সমস্যা হয়েছে। আবার চেষ্টা করুন।" },
  errRateLimit: {
    en: "Too many attempts. Please wait a moment and try again.",
    bn: "অনেকবার চেষ্টা করা হয়েছে। একটু অপেক্ষা করে আবার চেষ্টা করুন।",
  },
  checkoutCouponLabel: { en: "Coupon code", bn: "কুপন কোড" },
  checkoutCouponPlaceholder: { en: "Enter code", bn: "কোড লিখুন" },
  checkoutCouponApply: { en: "Apply", bn: "প্রয়োগ" },
  checkoutCouponRemove: { en: "Remove", bn: "বাদ দিন" },
  checkoutCouponApplied: { en: "Coupon applied", bn: "কুপন প্রয়োগ হয়েছে" },
  checkoutYourVouchers: { en: "Your vouchers", bn: "আপনার ভাউচার" },
  checkoutShippingChecking: { en: "Calculating…", bn: "হিসাব হচ্ছে…" },
  checkoutShippingUnavailable: { en: "Not available for this address", bn: "এই ঠিকানায় ডেলিভারি নেই" },
  errNoShipping: {
    en: "We can't deliver to this address online yet. Please contact the store to place this order.",
    bn: "এই ঠিকানায় এখনো অনলাইনে ডেলিভারি দেওয়া যাচ্ছে না। অর্ডারের জন্য দোকানে যোগাযোগ করুন।",
  },
  catalogUnavailable: {
    en: "Products are temporarily unavailable. Please try again shortly.",
    bn: "পণ্য এই মুহূর্তে দেখানো যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।",
  },
  outOfStock: { en: "Out of stock", bn: "স্টক শেষ" },
  cartItemsUnavailable: {
    en: "Some items in your cart are no longer available and were removed.",
    bn: "আপনার কার্টের কিছু পণ্য আর পাওয়া যাচ্ছে না, তাই সরিয়ে দেওয়া হয়েছে।",
  },

  // Checkout fields (API schema)
  fieldRequired: { en: "This field is required", bn: "এই ঘরটি পূরণ করা আবশ্যক" },
  fieldInvalid: { en: "Please check this value", bn: "মানটি সঠিক নয়, আবার দেখুন" },
  checkoutName: { en: "Your name", bn: "আপনার নাম" },
  checkoutNamePlaceholder: { en: "Enter your full name", bn: "আপনার পুরো নাম লিখুন" },
  fieldInvalidPhone: {
    en: "Enter a Bangladeshi mobile number, like 01712345678",
    bn: "একটি বাংলাদেশি মোবাইল নম্বর লিখুন, যেমন 01712345678",
  },
  checkoutShippingPending: { en: "Calculated when you confirm", bn: "অর্ডার নিশ্চিত করলে হিসাব হবে" },
  checkoutTax: { en: "Tax", bn: "ট্যাক্স" },
  checkoutDiscount: { en: "Discount", bn: "ছাড়" },
  checkoutTotalPending: {
    en: "Final total is confirmed by the store when you place the order.",
    bn: "অর্ডার করার সময় দোকান চূড়ান্ত মোট মূল্য নিশ্চিত করবে।",
  },
  orderStatusLabel: { en: "Status", bn: "অবস্থা" },
  orderItemsLabel: { en: "Items", bn: "পণ্য" },

  // Track order (API statuses)
  trackStageInTransit: { en: "In transit", bn: "পথে আছে" },
  trackStageOutForDelivery: { en: "Out for delivery", bn: "ডেলিভারির জন্য বের হয়েছে" },
  trackStageCancelled: { en: "Cancelled", bn: "বাতিল করা হয়েছে" },
  trackOrderNotFoundHelp: {
    en: "Check the order number and the phone number used when ordering, then try again.",
    bn: "অর্ডার নম্বর এবং অর্ডারের সময় দেওয়া মোবাইল নম্বরটি মিলিয়ে আবার চেষ্টা করুন।",
  },
  trackOrderTimeline: { en: "Order timeline", bn: "অর্ডারের ধাপ" },
  trackOrderShipment: { en: "Shipment", bn: "শিপমেন্ট" },
  trackOrderTrackingNo: { en: "Tracking no.", bn: "ট্র্যাকিং নম্বর" },

  // Newsletter errors
  newsletterInvalidEmail: { en: "Please enter a valid email address.", bn: "সঠিক ইমেইল ঠিকানা দিন।" },
  // Shared UI labels
  price: { en: "Price", bn: "দাম" },
  close: { en: "Close", bn: "বন্ধ করুন" },
  noMatches: { en: "No matches found", bn: "কিছু পাওয়া যায়নি" },
  countdownDays: { en: "Days", bn: "দিন" },
  countdownHours: { en: "Hours", bn: "ঘণ্টা" },
  countdownMins: { en: "Mins", bn: "মিনিট" },
  countdownSecs: { en: "Secs", bn: "সেকেন্ড" },
  checkoutDistrictPlaceholder: { en: "Type to search district", bn: "জেলার নাম লিখে খুঁজুন" },
  shippingReturnsTitle: { en: "Shipping & returns", bn: "ডেলিভারি ও রিটার্ন" },
  shippingReturnsDelivery: {
    en: "Delivery all across Bangladesh. The shipping charge is calculated from your address when you place the order. Wholesale and retail orders are both welcome.",
    bn: "সারা বাংলাদেশে ডেলিভারি দিই। ডেলিভারি চার্জ ঠিক হয় অর্ডারের সময় দেওয়া ঠিকানা দেখে। পাইকারি আর খুচরা, দুই ধরনের অর্ডারই নিই।",
  },
  shippingReturnsHelp: {
    en: "Questions about size, colour or a product's details? Message us on WhatsApp or Facebook before you order and we will help you choose.",
    bn: "সাইজ, রং বা পণ্যের খুঁটিনাটি নিয়ে প্রশ্ন আছে? অর্ডারের আগে হোয়াটসঅ্যাপ বা ফেসবুকে মেসেজ করুন, বেছে নিতে সাহায্য করব।",
  },
  notFoundTitle: { en: "Page not found", bn: "পেজটি পাওয়া যায়নি" },
  notFoundText: {
    en: "The page you're looking for doesn't exist or may have been moved.",
    bn: "এই পেজটি নেই, অথবা অন্য কোথাও সরানো হয়েছে।",
  },
  errorTitle: { en: "Something went wrong", bn: "কিছু একটা সমস্যা হয়েছে" },
  errorText: {
    en: "An unexpected error occurred. You can try again or head back home.",
    bn: "হঠাৎ একটা সমস্যা হয়েছে। আবার চেষ্টা করুন, নয়তো হোমে ফিরে যান।",
  },
  tryAgain: { en: "Try again", bn: "আবার চেষ্টা করুন" },
  backToHome: { en: "Back to home", bn: "হোমে ফিরে যান" },

  // Accessible names
  switchLanguage: { en: "Switch language between English and Bangla", bn: "ভাষা বদলান: ইংরেজি বা বাংলা" },
  openCart: { en: "Open cart", bn: "কার্ট খুলুন" },
  bottomNav: { en: "Bottom navigation", bn: "নিচের মেনু" },
  breadcrumb: { en: "Breadcrumb", bn: "পেজের পথ" },
  decreaseQuantity: { en: "Decrease quantity", bn: "পরিমাণ কমান" },
  increaseQuantity: { en: "Increase quantity", bn: "পরিমাণ বাড়ান" },
  closeFilters: { en: "Close filters", bn: "ফিল্টার বন্ধ করুন" },
  viewMode: { en: "View", bn: "দেখার ধরন" },
  gridView: { en: "Grid view", bn: "গ্রিড ভিউ" },
  listView: { en: "List view", bn: "লিস্ট ভিউ" },
  scrollCategoriesLeft: { en: "Scroll categories left", bn: "ক্যাটাগরি বাঁয়ে সরান" },
  scrollCategoriesRight: { en: "Scroll categories right", bn: "ক্যাটাগরি ডানে সরান" },
  heroCarousel: { en: "Featured banners", bn: "ফিচারড ব্যানার" },
  previousSlide: { en: "Previous slide", bn: "আগের স্লাইড" },
  nextSlide: { en: "Next slide", bn: "পরের স্লাইড" },
  slide: { en: "Slide", bn: "স্লাইড" },
  facebookLink: { en: "Kull Mart on Facebook", bn: "ফেসবুকে কুল মার্ট" },
  whatsappLink: { en: "Chat with Kull Mart on WhatsApp", bn: "হোয়াটসঅ্যাপে কুল মার্টের সাথে চ্যাট করুন" },
} satisfies Record<string, T>;

export type UiKey = keyof typeof DICT;
