import type { Product, ProductCategory, ProductSpec, ProductVariant, T } from "./types";

export const CATEGORY_NAMES: Record<ProductCategory, T> = {
  "womens-fashion": { en: "Women's Fashion", bn: "নারীদের ফ্যাশন" },
  "bags-wallets": { en: "Bags & Wallets", bn: "ব্যাগ ও ওয়ালেট" },
  jewellery: { en: "Jewellery", bn: "জুয়েলারি" },
  kids: { en: "Kids", bn: "কিডস" },
  gadgets: { en: "Gadgets & Audio", bn: "গ্যাজেটস ও অডিও" },
  lifestyle: { en: "Home & Lifestyle", bn: "হোম ও লাইফস্টাইল" },
};

export interface ProductInput {
  id: string;
  slug: string;
  sku: string;
  category: ProductCategory;
  name: T;
  tagline: T;
  description: T;
  /** File names under public/products, without the folder. First one is the cover. */
  images: string[];
  price: number;
  compareAtPrice?: number;
  stockCount: number;
  badge?: T;
  featured?: boolean;
  trending?: boolean;
  newArrival?: boolean;
  variants?: ProductVariant[];
  specs?: ProductSpec[];
  highlights?: T[];
  preorder?: {
    deliveryStart: string;
    deliveryEnd: string;
    expectedDelivery: T;
    closesOn: string;
    preorderCloses: T;
    maxQuantity: number;
    currentQuantity: number;
    status?: Product["preorderStatus"];
  };
}

/** Builds a catalogue entry. No reviews or ratings are invented: the page has none yet. */
export function makeProduct(input: ProductInput): Product {
  const gallery = input.images.map((file) => `products/${file}`);
  const { preorder } = input;
  return {
    id: input.id,
    slug: input.slug,
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    longDescription: input.description,
    price: input.price,
    compareAtPrice: input.compareAtPrice,
    category: input.category,
    categoryName: CATEGORY_NAMES[input.category],
    image: gallery[0],
    gallery,
    rating: 0,
    reviewCount: 0,
    inStock: true,
    stockCount: input.stockCount,
    sku: input.sku,
    badge: input.badge,
    featured: input.featured,
    trending: input.trending,
    newArrival: input.newArrival,
    variants: input.variants,
    specs: input.specs,
    highlights: input.highlights,
    ...(preorder && {
      isPreOrder: true,
      expectedDelivery: preorder.expectedDelivery,
      expectedDeliveryStart: preorder.deliveryStart,
      expectedDeliveryEnd: preorder.deliveryEnd,
      preorderCloses: preorder.preorderCloses,
      preorderEndDate: preorder.closesOn,
      maxPreorderQuantity: preorder.maxQuantity,
      currentPreorderQuantity: preorder.currentQuantity,
      preorderStatus: preorder.status ?? "available",
    }),
  };
}

/** Colour picker built from label pairs, e.g. colours(["Black", "কালো"], ...). */
export function colours(...options: [en: string, bn: string][]): ProductVariant {
  return {
    name: { en: "Colour", bn: "রং" },
    options: options.map(([en, bn]) => ({
      label: { en, bn },
      value: en,
      inStock: true,
    })),
  };
}
