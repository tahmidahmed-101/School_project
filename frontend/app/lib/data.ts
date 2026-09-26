import type { CategoryInfo, Product } from "./types";
import { colours, makeProduct } from "./make-product";
import { PREORDER_PRODUCTS } from "./preorder-data";
import { GADGET_PRODUCTS } from "./gadget-data";

import { BRAND_INFO } from "./brand";

export { BRAND_INFO };

const CATEGORY_DEFS: Omit<CategoryInfo, "itemCount">[] = [
  {
    id: "womens-fashion",
    slug: "womens-fashion",
    name: { en: "Women's Fashion", bn: "নারীদের ফ্যাশন" },
    description: {
      en: "Padded tank tops and everyday shorts in colours you'll want to wear on repeat",
      bn: "প্যাডেড ট্যাঙ্ক টপ আর নিত্যদিনের শর্টস — পছন্দের সব রঙে",
    },
    image: "products/tank-top-multi.jpg",
    accent: "#276325",
  },
  {
    id: "bags-wallets",
    slug: "bags-wallets",
    name: { en: "Bags & Wallets", bn: "ব্যাগ ও ওয়ালেট" },
    description: {
      en: "Slouchy shoulder bags, clasp wallets and sporty backpacks",
      bn: "শোল্ডার ব্যাগ, ক্ল্যাপ ওয়ালেট আর স্পোর্টি ব্যাকপ্যাক",
    },
    image: "products/hobo-bag-black-2.jpg",
    accent: "#e5c04c",
  },
  {
    id: "jewellery",
    slug: "jewellery",
    name: { en: "Jewellery", bn: "জুয়েলারি" },
    description: {
      en: "Statement gold-tone cuff bracelets with matching rings",
      bn: "গোল্ড-টোন কাফ ব্রেসলেট, সাথে ম্যাচিং রিং",
    },
    image: "products/gold-sunflower-cuff-1.jpg",
    accent: "#8f7220",
  },
  {
    id: "kids",
    slug: "kids",
    name: { en: "Kids", bn: "কিডস" },
    description: {
      en: "Soft plush backpacks featuring their favourite characters",
      bn: "প্রিয় কার্টুন চরিত্রের নরম প্লাশ ব্যাকপ্যাক",
    },
    image: "products/hello-kitty-backpack-1.jpg",
    accent: "#3a8036",
  },
  {
    id: "gadgets",
    slug: "gadgets",
    name: { en: "Gadgets & Audio", bn: "গ্যাজেটস ও অডিও" },
    description: {
      en: "Earbuds, neckbands, speakers, chargers and power banks",
      bn: "ইয়ারবাড, নেকব্যান্ড, স্পিকার, চার্জার ও পাওয়ার ব্যাংক",
    },
    image: "products/hoco-eq33-earbuds.jpg",
    accent: "#1b4816",
  },
  {
    id: "lifestyle",
    slug: "lifestyle",
    name: { en: "Home & Lifestyle", bn: "হোম ও লাইফস্টাইল" },
    description: {
      en: "Handy everyday carry, from pocket-size thermos flasks and more",
      bn: "রোজকার কাজের সুবিধাজনক জিনিস — পকেট সাইজ থার্মোস ফ্লাস্কসহ আরও অনেক কিছু",
    },
    image: "products/steel-flask-2.jpg",
    accent: "#5fa055",
  },
];

const BASE_PRODUCTS: Product[] = [
  // ==========================================
  // WOMEN'S FASHION
  // ==========================================
  makeProduct({
    id: "prod-01",
    slug: "padded-side-tie-tank-top",
    sku: "KM-C1022",
    category: "womens-fashion",
    name: {
      en: "Padded Side-Tie Ruched Tank Top",
      bn: "প্যাডেড সাইড-টাই রুচড ট্যাঙ্ক টপ",
    },
    tagline: {
      en: "Built-in padding, ruched side ties and a soft stretch fit",
      bn: "বিল্ট-ইন প্যাডিং, সাইডে ফিতা ও নরম স্ট্রেচ ফিট",
    },
    description: {
      en: "A scoop-neck tank with built-in bust padding and adjustable drawstring ruching down each side, so you can shape the fit to your own taste. Wear it alone, under a shrug or layered with an open shirt.",
      bn: "স্কুপ-নেক ট্যাঙ্ক টপ — বিল্ট-ইন প্যাডিং আর দুই পাশে ফিতা দিয়ে ইচ্ছেমতো ফিট ঠিক করার সুবিধা। একা পরুন, শ্রাগ কিংবা খোলা শার্টের সাথে লেয়ারিং করুন।",
    },
    images: [
      "tank-top-multi.jpg",
      "tank-top-pink.jpg",
      "tank-top-black.jpg",
      "tank-top-white.jpg",
      "tank-top-olive.jpg",
      "tank-top-red.jpg",
    ],
    price: 590,
    stockCount: 40,
    badge: { en: "Best seller", bn: "সেরা বিক্রি" },
    featured: true,
    trending: true,
    newArrival: true,
    variants: [
      colours(
        ["Black", "কালো"],
        ["White", "সাদা"],
        ["Hot Pink", "হট পিংক"],
        ["Olive", "অলিভ"],
        ["Maroon", "মেরুন"],
      ),
    ],
    specs: [
      { label: { en: "Style", bn: "স্টাইল" }, value: { en: "Scoop-neck tank", bn: "স্কুপ-নেক ট্যাঙ্ক" } },
      { label: { en: "Detail", bn: "ডিটেইল" }, value: { en: "Side drawstring ruching", bn: "সাইড ড্রয়স্ট্রিং রুচিং" } },
      { label: { en: "Padding", bn: "প্যাডিং" }, value: { en: "Built-in bust pads", bn: "বিল্ট-ইন প্যাড" } },
    ],
    highlights: [
      { en: "Built-in padding, no extra layer needed", bn: "বিল্ট-ইন প্যাডিং, আলাদা কিছু লাগে না" },
      { en: "Adjustable side ties to shape the fit", bn: "ফিতা টেনে নিজের মতো ফিট করে নিন" },
      { en: "Five colours to choose from", bn: "পাঁচটি রঙে পাওয়া যায়" },
    ],
  }),
  makeProduct({
    id: "prod-02",
    slug: "contrast-trim-lounge-shorts",
    sku: "KM-C1030",
    category: "womens-fashion",
    name: {
      en: "Contrast-Trim Lounge Shorts",
      bn: "কনট্রাস্ট-ট্রিম লাউঞ্জ শর্টস",
    },
    tagline: {
      en: "Elastic waist, curved hem and a crisp contrast edge",
      bn: "ইলাস্টিক কোমর, কার্ভড হেম আর কনট্রাস্ট পাইপিং",
    },
    description: {
      en: "Easy pull-on shorts with a soft elastic waistband and a curved, contrast-piped hem. Made for lounging at home, sleeping, light workouts or an easy day out.",
      bn: "নরম ইলাস্টিক কোমরের পুল-অন শর্টস, কার্ভড হেমে কনট্রাস্ট পাইপিং। বাসায় আরাম করা, ঘুমানো, হালকা ব্যায়াম কিংবা ঘুরতে যাওয়ার জন্য দারুণ।",
    },
    images: [
      "shorts-black-1.jpg",
      "shorts-black-2.jpg",
      "shorts-grey-1.jpg",
      "shorts-grey-2.jpg",
      "shorts-white.jpg",
    ],
    price: 420,
    stockCount: 60,
    trending: true,
    newArrival: true,
    variants: [colours(["Black", "কালো"], ["Grey", "ধূসর"], ["White", "সাদা"])],
    specs: [
      { label: { en: "Waist", bn: "কোমর" }, value: { en: "Soft elastic band", bn: "নরম ইলাস্টিক ব্যান্ড" } },
      { label: { en: "Detail", bn: "ডিটেইল" }, value: { en: "Contrast piping, curved hem", bn: "কনট্রাস্ট পাইপিং, কার্ভড হেম" } },
    ],
    highlights: [
      { en: "Lightweight, easy pull-on fit", bn: "হালকা, সহজে পরা যায়" },
      { en: "Great for lounging, sleep and workouts", bn: "লাউঞ্জ, ঘুম ও ব্যায়ামে সমান আরামদায়ক" },
    ],
  }),

  // ==========================================
  // BAGS & WALLETS
  // ==========================================
  makeProduct({
    id: "prod-03",
    slug: "soft-hobo-shoulder-bag",
    sku: "KM-BAG-003",
    category: "bags-wallets",
    name: {
      en: "Soft Leather-Look Hobo Shoulder Bag",
      bn: "সফট লেদার-লুক হোবো শোল্ডার ব্যাগ",
    },
    tagline: {
      en: "Slouchy, roomy and easy to carry from work to weekend",
      bn: "স্লাউচি, প্রশস্ত আর অফিস থেকে ঘোরাঘুরি — সব জায়গায় মানানসই",
    },
    description: {
      en: "A relaxed hobo silhouette with a wide shoulder strap, a roomy main compartment and a front pocket for the things you reach for most. Slouchy soft body that holds its shape without feeling stiff.",
      bn: "চওড়া স্ট্র্যাপ, বড় মূল কম্পার্টমেন্ট আর সামনে ছোট পকেটসহ রিল্যাক্সড হোবো ডিজাইন। নরম বডি, তবু আকার ঠিক থাকে।",
    },
    images: [
      "hobo-bag-black-1.jpg",
      "hobo-bag-black-2.jpg",
      "hobo-bag-brown.jpg",
      "hobo-bag-mint.jpg",
    ],
    price: 1290,
    stockCount: 18,
    badge: { en: "New", bn: "নতুন" },
    featured: true,
    trending: true,
    variants: [colours(["Black", "কালো"], ["Tan Brown", "ট্যান ব্রাউন"], ["Mint", "মিন্ট"])],
    specs: [
      { label: { en: "Style", bn: "স্টাইল" }, value: { en: "Hobo shoulder bag", bn: "হোবো শোল্ডার ব্যাগ" } },
      { label: { en: "Finish", bn: "ফিনিশ" }, value: { en: "Soft leather-look", bn: "সফট লেদার-লুক" } },
      { label: { en: "Pockets", bn: "পকেট" }, value: { en: "Main compartment + front pocket", bn: "মূল কম্পার্টমেন্ট + সামনে পকেট" } },
    ],
    highlights: [
      { en: "Wide strap sits comfortably on the shoulder", bn: "চওড়া স্ট্র্যাপ কাঁধে আরামদায়ক" },
      { en: "Roomy enough for daily essentials", bn: "রোজকার জিনিস রাখার মতো বড়" },
    ],
  }),
  makeProduct({
    id: "prod-04",
    slug: "ladies-clasp-flap-wallet",
    sku: "KM-BAG-004",
    category: "bags-wallets",
    name: {
      en: "Ladies' Clasp Flap Wallet",
      bn: "লেডিস ক্ল্যাপ ফ্ল্যাপ ওয়ালেট",
    },
    tagline: {
      en: "Compact tri-fold wallet with a gold-tone clasp",
      bn: "গোল্ড-টোন ক্ল্যাপসহ কমপ্যাক্ট ট্রাই-ফোল্ড ওয়ালেট",
    },
    description: {
      en: "A compact flap wallet with a gold-tone clasp and contrast edging, in three finishes. Slips easily into a handbag and keeps cards, cash and coins in one tidy place.",
      bn: "গোল্ড-টোন ক্ল্যাপ আর কনট্রাস্ট এজিংসহ কমপ্যাক্ট ফ্ল্যাপ ওয়ালেট, তিনটি ফিনিশে। হ্যান্ডব্যাগে সহজে ঢোকে — কার্ড, টাকা ও খুচরা এক জায়গায় গুছিয়ে রাখা যায়।",
    },
    images: ["clasp-wallet-1.jpg", "clasp-wallet-2.jpg"],
    price: 650,
    stockCount: 25,
    trending: true,
    variants: [
      colours(["Beige", "বেইজ"], ["Black Print", "ব্ল্যাক প্রিন্ট"], ["Houndstooth", "হাউন্ডসটুথ"]),
    ],
    specs: [
      { label: { en: "Closure", bn: "ক্লোজার" }, value: { en: "Gold-tone clasp flap", bn: "গোল্ড-টোন ক্ল্যাপ ফ্ল্যাপ" } },
      { label: { en: "Size", bn: "সাইজ" }, value: { en: "Compact, handbag-friendly", bn: "কমপ্যাক্ট, হ্যান্ডব্যাগে সহজে ধরে" } },
    ],
    highlights: [
      { en: "Three finishes: beige, black print, houndstooth", bn: "তিনটি ডিজাইন: বেইজ, ব্ল্যাক প্রিন্ট, হাউন্ডসটুথ" },
      { en: "Slim enough for a small bag", bn: "ছোট ব্যাগেও অনায়াসে ধরে" },
    ],
  }),
  makeProduct({
    id: "prod-05",
    slug: "atyp-sport-backpack",
    sku: "KM-C1029",
    category: "bags-wallets",
    name: {
      en: "ATYP Sport Backpack with Plush Charm",
      bn: "ATYP স্পোর্ট ব্যাকপ্যাক (প্লাশ চার্মসহ)",
    },
    tagline: {
      en: "Black and cream colour-block backpack with a front zip pocket",
      bn: "ব্ল্যাক ও ক্রিম কালার-ব্লক ব্যাকপ্যাক, সামনে জিপ পকেট",
    },
    description: {
      en: "A sporty black backpack with cream side panels, a big zip pocket on the front and a cute plush charm on the strap. Comfortable padded straps make it easy for college, tuition or a day out.",
      bn: "ক্রিম সাইড প্যানেলসহ স্পোর্টি ব্ল্যাক ব্যাকপ্যাক — সামনে বড় জিপ পকেট, স্ট্র্যাপে ঝুলছে কিউট প্লাশ চার্ম। কলেজ, টিউশন কিংবা ঘুরতে যাওয়ার জন্য আরামদায়ক প্যাডেড স্ট্র্যাপ।",
    },
    images: ["atyp-backpack-1.jpg", "atyp-backpack-2.jpg", "atyp-backpack-3.jpg"],
    price: 1490,
    stockCount: 14,
    badge: { en: "Trending", bn: "ট্রেন্ডিং" },
    trending: true,
    newArrival: true,
    specs: [
      { label: { en: "Design", bn: "ডিজাইন" }, value: { en: "Black with cream panels", bn: "ব্ল্যাক, ক্রিম প্যানেলসহ" } },
      { label: { en: "Extras", bn: "এক্সট্রা" }, value: { en: "Plush charm included", bn: "প্লাশ চার্মসহ" } },
    ],
    highlights: [
      { en: "Large front zip pocket", bn: "সামনে বড় জিপ পকেট" },
      { en: "Padded shoulder straps", bn: "প্যাডেড শোল্ডার স্ট্র্যাপ" },
    ],
  }),

  // ==========================================
  // JEWELLERY
  // ==========================================
  makeProduct({
    id: "prod-06",
    slug: "gold-mirror-disc-cuff-set",
    sku: "KM-JWL-006",
    category: "jewellery",
    name: {
      en: "Gold Mirror-Disc Cuff & Ring Set",
      bn: "গোল্ড মিরর-ডিস্ক কাফ ও রিং সেট",
    },
    tagline: {
      en: "Layered polished discs that catch every light",
      bn: "পরতে পরতে সাজানো পালিশ ডিস্ক, আলোয় ঝলমল করে",
    },
    description: {
      en: "A wide open cuff bracelet made from overlapping mirror-polished gold-tone discs, paired with a matching open ring. A bold statement piece for weddings, parties and festive outfits.",
      bn: "একটার ওপর একটা মিরর-পালিশ গোল্ড-টোন ডিস্ক দিয়ে তৈরি চওড়া ওপেন কাফ ব্রেসলেট, সাথে ম্যাচিং ওপেন রিং। বিয়ে, পার্টি আর উৎসবের পোশাকে দারুণ স্টেটমেন্ট পিস।",
    },
    images: ["gold-disc-cuff-1.jpg", "gold-disc-cuff-2.jpg", "gold-disc-cuff-3.jpg"],
    price: 890,
    stockCount: 20,
    badge: { en: "Statement piece", bn: "স্টেটমেন্ট পিস" },
    featured: true,
    specs: [
      { label: { en: "Set", bn: "সেট" }, value: { en: "Cuff bracelet + open ring", bn: "কাফ ব্রেসলেট + ওপেন রিং" } },
      { label: { en: "Finish", bn: "ফিনিশ" }, value: { en: "Polished gold-tone", bn: "পালিশ গোল্ড-টোন" } },
    ],
    highlights: [
      { en: "Open cuff design, easy to slip on", bn: "ওপেন কাফ ডিজাইন, সহজে পরা যায়" },
      { en: "Matching ring included", bn: "ম্যাচিং রিং সাথেই" },
    ],
  }),
  makeProduct({
    id: "prod-07",
    slug: "gold-sunflower-cuff-set",
    sku: "KM-JWL-007",
    category: "jewellery",
    name: {
      en: "Gold Sunflower Cuff & Ring Set",
      bn: "গোল্ড সানফ্লাওয়ার কাফ ও রিং সেট",
    },
    tagline: {
      en: "Sculpted petal cuff with a matching flower ring",
      bn: "পাপড়ির কারুকাজ করা কাফ, সাথে ফুলের রিং",
    },
    description: {
      en: "A sculpted cuff bracelet with a radiating sunflower motif and a matching cocktail ring. Its high-shine gold-tone finish lifts a plain outfit instantly.",
      bn: "সূর্যমুখীর নকশা করা কাফ ব্রেসলেট, সাথে ম্যাচিং ককটেল রিং। উজ্জ্বল গোল্ড-টোন ফিনিশ সাদামাটা পোশাকেও এনে দেয় আলাদা মাত্রা।",
    },
    images: ["gold-sunflower-cuff-1.jpg", "gold-sunflower-cuff-2.jpg"],
    price: 850,
    stockCount: 20,
    trending: true,
    specs: [
      { label: { en: "Set", bn: "সেট" }, value: { en: "Cuff bracelet + flower ring", bn: "কাফ ব্রেসলেট + ফুলের রিং" } },
      { label: { en: "Finish", bn: "ফিনিশ" }, value: { en: "High-shine gold-tone", bn: "হাই-শাইন গোল্ড-টোন" } },
    ],
    highlights: [
      { en: "Sculpted sunflower design", bn: "সূর্যমুখীর কারুকাজ" },
      { en: "Ring and cuff sold as a set", bn: "রিং ও কাফ একসাথে সেট হিসেবে" },
    ],
  }),
  makeProduct({
    id: "prod-08",
    slug: "gold-floral-engraved-cuff-set",
    sku: "KM-JWL-008",
    category: "jewellery",
    name: {
      en: "Gold Floral-Engraved Wide Cuff & Ring Set",
      bn: "গোল্ড ফ্লোরাল এনগ্রেভড ওয়াইড কাফ ও রিং সেট",
    },
    tagline: {
      en: "Wide engraved cuff with delicate flower detailing",
      bn: "ফুলের সূক্ষ্ম নকশা খোদাই করা চওড়া কাফ",
    },
    description: {
      en: "A wide, lightweight cuff covered in finely engraved flowers, with a matching open ring. Elegant enough for weddings, simple enough to wear with a kurti or saree every day.",
      bn: "ফুলের সূক্ষ্ম নকশা খোদাই করা চওড়া ও হালকা কাফ, সাথে ম্যাচিং ওপেন রিং। বিয়েতে যেমন মানানসই, কুর্তি বা শাড়ির সাথে রোজ পরার জন্যও তেমনি।",
    },
    images: ["gold-floral-cuff-1.jpg", "gold-floral-cuff-2.jpg"],
    price: 790,
    stockCount: 22,
    newArrival: true,
    specs: [
      { label: { en: "Set", bn: "সেট" }, value: { en: "Wide cuff + open ring", bn: "ওয়াইড কাফ + ওপেন রিং" } },
      { label: { en: "Detail", bn: "ডিটেইল" }, value: { en: "Engraved floral pattern", bn: "খোদাই করা ফুলের নকশা" } },
    ],
    highlights: [
      { en: "Wide cuff with engraved flowers", bn: "ফুলের নকশা খোদাই করা চওড়া কাফ" },
      { en: "Comfortable, lightweight wear", bn: "হালকা, পরতে আরামদায়ক" },
    ],
  }),

  // ==========================================
  // KIDS
  // ==========================================
  makeProduct({
    id: "prod-09",
    slug: "spiderman-kids-plush-backpack",
    sku: "KM-KID-009",
    category: "kids",
    name: {
      en: "Spider-Man Kids Plush Backpack",
      bn: "স্পাইডার-ম্যান কিডস প্লাশ ব্যাকপ্যাক",
    },
    tagline: {
      en: "Red-and-blue mask design with a front zip pocket",
      bn: "লাল-নীল মাস্ক ডিজাইন, সামনে জিপ পকেট",
    },
    description: {
      en: "A soft plush backpack in a bright red Spider-Man design, with a zipped main pocket and padded straps sized for small shoulders. Right for nursery, play school or trips to the park.",
      bn: "উজ্জ্বল লাল স্পাইডার-ম্যান ডিজাইনের নরম প্লাশ ব্যাকপ্যাক — জিপ দেওয়া মূল পকেট আর ছোটদের কাঁধের মাপে প্যাডেড স্ট্র্যাপ। নার্সারি, প্লে স্কুল বা পার্কে যাওয়ার জন্য উপযোগী।",
    },
    images: ["spiderman-kids-backpack.jpg"],
    price: 480,
    stockCount: 30,
    featured: true,
    trending: true,
    specs: [
      { label: { en: "Material", bn: "উপাদান" }, value: { en: "Soft plush", bn: "নরম প্লাশ" } },
      { label: { en: "Age", bn: "বয়স" }, value: { en: "Toddlers and young kids", bn: "টডলার ও ছোট শিশুরা" } },
    ],
    highlights: [
      { en: "Soft plush, gentle on little backs", bn: "নরম প্লাশ, ছোটদের পিঠে আরামদায়ক" },
      { en: "Zipped main pocket", bn: "জিপ দেওয়া মূল পকেট" },
    ],
  }),
  makeProduct({
    id: "prod-10",
    slug: "hello-kitty-kids-plush-backpack",
    sku: "KM-KID-010",
    category: "kids",
    name: {
      en: "Hello Kitty Kids Plush Backpack",
      bn: "হ্যালো কিটি কিডস প্লাশ ব্যাকপ্যাক",
    },
    tagline: {
      en: "Pink plush with a big bow and embroidered face",
      bn: "গোলাপি প্লাশ, বড় ফিতা আর এমব্রয়ডারি করা মুখ",
    },
    description: {
      en: "A cuddly pink plush backpack with an embroidered face, a soft bow and a zipped front pocket. A perfect first backpack for little girls.",
      bn: "গোলাপি নরম প্লাশ ব্যাকপ্যাক — এমব্রয়ডারি করা মুখ, নরম ফিতা আর সামনে জিপ পকেট। ছোট মেয়েদের প্রথম ব্যাকপ্যাকের জন্য একদম মানানসই।",
    },
    images: ["hello-kitty-backpack-1.jpg", "hello-kitty-backpack-2.jpg"],
    price: 480,
    stockCount: 30,
    trending: true,
    newArrival: true,
    specs: [
      { label: { en: "Material", bn: "উপাদান" }, value: { en: "Soft plush", bn: "নরম প্লাশ" } },
      { label: { en: "Detail", bn: "ডিটেইল" }, value: { en: "Embroidered face, fabric bow", bn: "এমব্রয়ডারি মুখ, কাপড়ের ফিতা" } },
    ],
    highlights: [
      { en: "Cuddly plush finish", bn: "জড়িয়ে ধরার মতো নরম প্লাশ" },
      { en: "Zipped pocket for snacks and small toys", bn: "নাস্তা ও ছোট খেলনার জন্য জিপ পকেট" },
    ],
  }),
  makeProduct({
    id: "prod-11",
    slug: "minnie-kids-plush-backpack",
    sku: "KM-KID-011",
    category: "kids",
    name: {
      en: "Minnie Mouse Kids Plush Backpack",
      bn: "মিনি মাউস কিডস প্লাশ ব্যাকপ্যাক",
    },
    tagline: {
      en: "Polka-dot bow, big ears and a cheerful face",
      bn: "পোলকা-ডট ফিতা, বড় কান আর হাসিখুশি মুখ",
    },
    description: {
      en: "A soft pink Minnie Mouse backpack with big round ears, a polka-dot bow and a bright smiling face. Lightweight and easy for kids to carry.",
      bn: "গোলাপি মিনি মাউস ব্যাকপ্যাক — বড় গোল কান, পোলকা-ডট ফিতা আর হাসিমাখা মুখ। হালকা, বাচ্চাদের বইতে সহজ।",
    },
    images: ["minnie-kids-backpack.jpg"],
    price: 480,
    stockCount: 30,
    trending: true,
    specs: [
      { label: { en: "Material", bn: "উপাদান" }, value: { en: "Soft plush", bn: "নরম প্লাশ" } },
      { label: { en: "Detail", bn: "ডিটেইল" }, value: { en: "Polka-dot bow, 3D ears", bn: "পোলকা-ডট ফিতা, থ্রিডি কান" } },
    ],
    highlights: [
      { en: "Playful 3D ears and bow", bn: "মজার থ্রিডি কান ও ফিতা" },
      { en: "Lightweight for small shoulders", bn: "ছোট কাঁধের জন্য হালকা" },
    ],
  }),
  makeProduct({
    id: "prod-12",
    slug: "pooh-kids-plush-backpack",
    sku: "KM-KID-012",
    category: "kids",
    name: {
      en: "Winnie the Pooh Kids Plush Backpack",
      bn: "উইনি দ্য পুহ কিডস প্লাশ ব্যাকপ্যাক",
    },
    tagline: {
      en: "Sunny yellow plush with round ears and a friendly smile",
      bn: "রোদেলা হলুদ প্লাশ, গোল কান আর বন্ধুসুলভ হাসি",
    },
    description: {
      en: "A bright yellow Pooh backpack in soft plush, with round ears, an embroidered name and a friendly smile. Sized right for nursery and play school.",
      bn: "উজ্জ্বল হলুদ নরম প্লাশের পুহ ব্যাকপ্যাক — গোল কান, এমব্রয়ডারি করা নাম আর হাসিমুখ। নার্সারি ও প্লে স্কুলের জন্য ঠিক মাপের।",
    },
    images: ["pooh-kids-backpack.jpg"],
    price: 480,
    stockCount: 30,
    newArrival: true,
    specs: [
      { label: { en: "Material", bn: "উপাদান" }, value: { en: "Soft plush", bn: "নরম প্লাশ" } },
      { label: { en: "Age", bn: "বয়স" }, value: { en: "Toddlers and young kids", bn: "টডলার ও ছোট শিশুরা" } },
    ],
    highlights: [
      { en: "Bright, easy-to-spot colour", bn: "চোখে পড়ার মতো উজ্জ্বল রং" },
      { en: "Soft padded feel", bn: "নরম প্যাডেড অনুভূতি" },
    ],
  }),

  // ==========================================
  // HOME & LIFESTYLE
  // ==========================================
  makeProduct({
    id: "prod-13",
    slug: "mini-steel-thermos-flask",
    sku: "KM-LIF-013",
    category: "lifestyle",
    name: {
      en: "Mini Stainless Steel Thermos Flask",
      bn: "মিনি স্টেইনলেস স্টিল থার্মোস ফ্লাস্ক",
    },
    tagline: {
      en: "Pocket-size flask in seven fresh colours",
      bn: "পকেট সাইজ ফ্লাস্ক, সাতটি সতেজ রঙে",
    },
    description: {
      en: "A small stainless steel thermos with a screw-on steel cap. Small enough for a handbag or school bag, ideal for tea, coffee, warm water or a kid's drink.",
      bn: "স্ক্রু-অন স্টিল ক্যাপসহ ছোট স্টেইনলেস স্টিল থার্মোস। হ্যান্ডব্যাগ বা স্কুলব্যাগে সহজে ধরে — চা, কফি, গরম পানি কিংবা বাচ্চাদের পানীয়ের জন্য চমৎকার।",
    },
    images: ["steel-flask-2.jpg", "steel-flask-1.jpg"],
    price: 620,
    stockCount: 35,
    featured: true,
    variants: [
      colours(
        ["Mint", "মিন্ট"],
        ["Silver", "সিলভার"],
        ["Black", "কালো"],
        ["Orange", "কমলা"],
        ["Gold", "গোল্ড"],
        ["Cream", "ক্রিম"],
        ["Red", "লাল"],
      ),
    ],
    specs: [
      { label: { en: "Body", bn: "বডি" }, value: { en: "Stainless steel", bn: "স্টেইনলেস স্টিল" } },
      { label: { en: "Size", bn: "সাইজ" }, value: { en: "Mini, pocket-friendly", bn: "মিনি, পকেট-ফ্রেন্ডলি" } },
    ],
    highlights: [
      { en: "Fits a handbag or school bag", bn: "হ্যান্ডব্যাগ বা স্কুলব্যাগে সহজেই ধরে" },
      { en: "Seven colours to choose from", bn: "সাতটি রঙে পাওয়া যায়" },
    ],
  }),
];

export const PRODUCTS: Product[] = [...BASE_PRODUCTS, ...GADGET_PRODUCTS, ...PREORDER_PRODUCTS];

/** Regular in-stock catalogue: everything except pre-order items. */
export const STOCK_PRODUCTS: Product[] = PRODUCTS.filter((product) => !product.isPreOrder);

export const CATEGORIES: CategoryInfo[] = CATEGORY_DEFS.map((category) => ({
  ...category,
  itemCount: PRODUCTS.filter((product) => product.category === category.id).length,
}));

export { PREORDER_PRODUCTS };
