import type { Product } from "@/lib/types";

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

/** True for a pre-order that is marked sold out or has reached its reservation cap. */
export function isPreOrderSoldOut(product: Product): boolean {
  if (!product.isPreOrder) return false;
  if (product.preorderStatus === "sold-out") return true;
  // A cap of 0 or nothing reserved yet are real values, so compare against undefined rather than truthiness.
  return (
    product.maxPreorderQuantity !== undefined && (product.currentPreorderQuantity ?? 0) >= product.maxPreorderQuantity
  );
}

/** Belongs to the pre-order shop: its category is a pre-order one. */
export function isPreOrderShopProduct(product: Product): boolean {
  return product.kind === "preorder";
}

/** Dictionary key for why a product cannot be bought: a pre-order that is not open reads differently from no stock. */
export function unavailableLabel(product: Product): "outOfStock" | "preOrderNotOpen" | "preOrderClosed" {
  if (product.preorderStatus === "upcoming") return "preOrderNotOpen";
  if (product.preorderStatus === "closed") return "preOrderClosed";
  return "outOfStock";
}

/** Largest quantity a shopper can add for one order line. */
export function getMaxOrderQuantity(product: Product): number {
  if (!product.isPreOrder) return product.stockCount;
  if (product.maxPreorderQuantity !== undefined) {
    return Math.max(1, product.maxPreorderQuantity - (product.currentPreorderQuantity ?? 0));
  }
  return 10;
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
