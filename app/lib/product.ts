import type { Product } from "./types";

/** Whole-number percentage off, or null when the product is not discounted. */
export function getDiscountPercent(product: Product): number | null {
  if (!product.compareAtPrice || product.compareAtPrice <= product.price) return null;
  return Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100);
}

/** True for a pre-order that is marked sold out or has reached its reservation cap. */
export function isPreOrderSoldOut(product: Product): boolean {
  if (!product.isPreOrder) return false;
  return (
    product.preorderStatus === "sold-out" ||
    Boolean(
      product.maxPreorderQuantity &&
        product.currentPreorderQuantity &&
        product.currentPreorderQuantity >= product.maxPreorderQuantity,
    )
  );
}

/** Largest quantity a shopper can add for one order line. */
export function getMaxOrderQuantity(product: Product): number {
  if (!product.isPreOrder) return product.stockCount;
  if (product.maxPreorderQuantity && product.currentPreorderQuantity) {
    return Math.max(1, product.maxPreorderQuantity - product.currentPreorderQuantity);
  }
  return 10;
}

/** Quick-search matching shared by the navbar dropdown and the mobile search sheet. */
export function searchProducts(
  products: Product[],
  rawQuery: string,
  limit: number,
  { includeDescription = false }: { includeDescription?: boolean } = {},
): Product[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  return products
    .filter((p) => {
      const fields = [p.name.en, p.name.bn, p.tagline.en, p.category];
      if (includeDescription) fields.push(p.description.en);
      return fields.some((field) => field.toLowerCase().includes(q));
    })
    .slice(0, limit);
}
