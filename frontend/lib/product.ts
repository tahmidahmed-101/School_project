import type { Product, ProductSale } from "@/lib/types";

/** True if any field contains the query, case-insensitively. */
export function matchesQuery(fields: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return false;
  return fields.some((field) => field.toLowerCase().includes(q));
}

/** Whole-number percentage off, or null when the product is not discounted. */
export function getDiscountPercent(product: Product): number | null {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return null;
  return Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
}

/** The sale running on the product, or null when there is none or it leaves the chosen SKU out. */
export function getSaleOffer(product: Product): ProductSale | null {
  if (!product.sale || product.salePrice === undefined) return null;
  return product.sale;
}

/** Largest quantity a shopper can add for one order line. */
export function getMaxOrderQuantity(product: Product): number {
  return product.stockCount;
}

/** Product listing; `params` are `/shop` query parameters. */
export function shopListing(params: Record<string, string> = {}): string {
  const query = new URLSearchParams(params).toString();
  return query ? `/shop?${query}` : "/shop";
}

/** The few product fields the header search needs; the search index carries only these. */
export type SearchEntry = Pick<
  Product,
  "id" | "slug" | "name" | "tagline" | "category" | "categoryName" | "image" | "price"
>;

export function toSearchEntry(product: Product): SearchEntry {
  const { id, slug, name, tagline, category, categoryName, image, price } = product;
  return { id, slug, name, tagline, category, categoryName, image, price };
}

/** Quick-search matching shared by the navbar dropdown and the mobile search sheet. */
export function searchProducts(products: SearchEntry[], rawQuery: string, limit: number): SearchEntry[] {
  if (!rawQuery.trim()) return [];
  return products
    .filter((p) => matchesQuery([p.name.en, p.name.bn, p.tagline.en, p.category], rawQuery))
    .slice(0, limit);
}
