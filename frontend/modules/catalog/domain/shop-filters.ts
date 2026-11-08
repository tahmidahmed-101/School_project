import type { CategoryInfo, Product } from "@/lib/types";
import { getDiscountPercent, matchesQuery } from "@/lib/product";
import { categoryFamily } from "./category-tree";

export interface FilterState {
  category: string;
  collection: string;
  maxPrice: number;
  inStockOnly: boolean;
  sort: string;
  searchQuery: string;
}

export type FilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;

/** Price step of the "max price" slider. */
export const PRICE_STEP = 50;

/** Slider range that spans the catalogue, rounded outwards to the step. Never zero-width. */
export function priceBounds(products: Product[]): { min: number; max: number } {
  const prices = products.map((p) => p.price).filter((price) => Number.isFinite(price) && price > 0);
  if (prices.length === 0) return { min: 0, max: PRICE_STEP * 20 };
  const min = Math.floor(Math.min(...prices) / PRICE_STEP) * PRICE_STEP;
  const max = Math.ceil(Math.max(...prices) / PRICE_STEP) * PRICE_STEP;
  return { min, max: max > min ? max : min + PRICE_STEP };
}

export const DEFAULT_FILTERS: FilterState = {
  category: "all",
  collection: "all",
  // Infinity = no price cap. The slider maps its top end to this, so a catalogue of any price range works.
  maxPrice: Number.POSITIVE_INFINITY,
  inStockOnly: false,
  sort: "featured",
  searchQuery: "",
};

/** How many filters (search, category, collection, price cap, stock) narrow the catalogue. */
export function countActiveFilters(filters: FilterState): number {
  return [
    Boolean(filters.searchQuery),
    filters.category !== "all",
    filters.collection !== "all",
    Number.isFinite(filters.maxPrice),
    filters.inStockOnly,
  ].filter(Boolean).length;
}

function matchesSearch(product: Product, rawQuery: string): boolean {
  if (!rawQuery.trim()) return true;
  return matchesQuery(
    [
      product.name.en,
      product.name.bn,
      product.description.en,
      product.description.bn,
      product.category,
      product.categoryName.en,
      product.categoryName.bn,
    ],
    rawQuery,
  );
}

function matchesFilters(product: Product, filters: FilterState, family: Set<string> | null): boolean {
  if (!matchesSearch(product, filters.searchQuery)) return false;

  if (family && !family.has(product.category.toLowerCase())) return false;

  if (filters.collection === "trending" && !product.trending) return false;
  if (filters.collection === "sale" && getDiscountPercent(product) === null) return false;
  if (filters.collection === "new" && !product.newArrival) return false;

  if (product.price > filters.maxPrice) return false;
  if (filters.inStockOnly && !product.inStock) return false;

  return true;
}

function compareProducts(sort: string): (a: Product, b: Product) => number {
  switch (sort) {
    case "price-asc":
      return (a, b) => a.price - b.price;
    case "price-desc":
      return (a, b) => b.price - a.price;
    case "discount":
      return (a, b) => savings(b) - savings(a);
    case "newest":
      return (a, b) => Number(Boolean(b.newArrival)) - Number(Boolean(a.newArrival));
    case "name-asc":
      return (a, b) => a.name.en.localeCompare(b.name.en);
    case "name-desc":
      return (a, b) => b.name.en.localeCompare(a.name.en);
    default:
      return (a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured));
  }
}

const savings = (p: Product) => (p.compareAtPrice ? p.compareAtPrice - p.price : 0);

/** `categories` lets a main category also list the products of its subcategories. */
export function filterAndSortProducts(
  products: Product[],
  filters: FilterState,
  categories: CategoryInfo[] = [],
): Product[] {
  const family = filters.category === "all" ? null : categoryFamily(categories, filters.category);
  return products.filter((p) => matchesFilters(p, filters, family)).sort(compareProducts(filters.sort));
}
