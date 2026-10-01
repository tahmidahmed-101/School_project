import type { Product } from "@/lib/types";

export const TRENDING_SIZE = 12;
export const BEST_SELLER_SIZE = 8;
export const CATEGORY_SHELF_SIZE = 8;

/** Featured products first, then catalogue order. */
export function bestSellers(stockProducts: Product[]): Product[] {
  return [...stockProducts]
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
    .slice(0, BEST_SELLER_SIZE);
}

/**
 * Only the products the home sections render, in catalogue order, so the page payload stays flat as the catalogue
 * grows. Every shelf picks a prefix in catalogue order, so the subset yields the same shelves as the full list.
 */
export function homeProducts(products: Product[]): Product[] {
  const stock = products.filter((p) => !p.isPreOrder);
  const keep = new Set<string>([...stock.slice(0, TRENDING_SIZE), ...bestSellers(stock)].map((p) => p.id));
  const perCategory = new Map<string, number>();
  for (const p of stock) {
    const seen = perCategory.get(p.category) ?? 0;
    if (seen < CATEGORY_SHELF_SIZE) keep.add(p.id);
    perCategory.set(p.category, seen + 1);
  }
  return stock.filter((p) => keep.has(p.id));
}
