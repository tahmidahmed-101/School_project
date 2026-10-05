import type { Product } from "@/lib/types";

export const TRENDING_SIZE = 10;
export const BEST_SELLER_SIZE = 10;
const CATEGORY_SHELF_SIZE = 10;

/** Desktop rows hold 5 cards, so a shelf shows 10 or 5 when it can; shorter lists show everything. */
export function shelfSize(available: number, cap: number): number {
  if (available >= cap) return cap;
  if (available >= 5) return available - (available % 5);
  return available;
}

export function trending(stockProducts: Product[]): Product[] {
  return stockProducts.slice(0, TRENDING_SIZE);
}

/** Featured products first, then catalogue order, skipping anything trending already shows. */
export function bestSellers(stockProducts: Product[]): Product[] {
  const shown = new Set(trending(stockProducts).map((p) => p.id));
  const rest = stockProducts
    .filter((p) => !shown.has(p.id))
    .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
  // A short leftover list would just repeat the category shelves below, so hide the shelf instead.
  if (rest.length < 5) return [];
  return rest.slice(0, shelfSize(rest.length, BEST_SELLER_SIZE));
}

export function categoryShelf(stockProducts: Product[], categoryId: string): Product[] {
  const inCategory = stockProducts.filter((p) => p.category === categoryId);
  return inCategory.slice(0, shelfSize(inCategory.length, CATEGORY_SHELF_SIZE));
}

/**
 * Only the products the home sections render, in catalogue order, so the page payload stays flat as the catalogue
 * grows. Every shelf picks a prefix in catalogue order, so the subset yields the same shelves as the full list.
 */
export function homeProducts(products: Product[]): Product[] {
  const stock = products.filter((p) => !p.isPreOrder);
  const keep = new Set<string>([...trending(stock), ...bestSellers(stock)].map((p) => p.id));
  const perCategory = new Map<string, number>();
  for (const p of stock) {
    const seen = perCategory.get(p.category) ?? 0;
    if (seen < CATEGORY_SHELF_SIZE) keep.add(p.id);
    perCategory.set(p.category, seen + 1);
  }
  return stock.filter((p) => keep.has(p.id));
}
