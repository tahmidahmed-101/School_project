import type { Product, SkuVariant } from "@/lib/types";

const text = (value: string) => ({ en: value, bn: value });

export function makeSku(overrides: Partial<SkuVariant> = {}): SkuVariant {
  return {
    id: "sku-1",
    sku: "SKU-1",
    optionValueIds: [],
    title: "",
    price: 500,
    inStock: true,
    isPreOrder: false,
    ...overrides,
  };
}

export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p-1",
    slug: "test-product",
    name: text("Test Product"),
    tagline: text("A tagline"),
    description: text("A description"),
    longDescription: text("A description"),
    price: 500,
    category: "bags",
    categoryName: text("Bags"),
    image: "/catalog/test-1.jpg",
    gallery: ["/catalog/test-1.jpg"],
    rating: 0,
    reviewCount: 0,
    inStock: true,
    stockCount: 10,
    sku: "SKU-1",
    kind: "stock",
    ...overrides,
  };
}
