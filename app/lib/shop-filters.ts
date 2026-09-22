import type { Product } from "./types";
import { getDiscountPercent, matchesQuery } from "./product";

export interface FilterState {
  category: string;
  collection: string;
  maxPrice: number;
  inStockOnly: boolean;
  sort: string;
  searchQuery: string;
}

export type FilterChange = <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;

export const MIN_PRICE = 250;
export const MAX_PRICE = 2000;

export const DEFAULT_FILTERS: FilterState = {
  category: "all",
  collection: "all",
  maxPrice: MAX_PRICE,
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
    filters.maxPrice < MAX_PRICE,
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

function matchesFilters(product: Product, filters: FilterState): boolean {
  if (!matchesSearch(product, filters.searchQuery)) return false;

  if (
    filters.category !== "all" &&
    product.category.toLowerCase() !== filters.category.toLowerCase()
  ) {
    return false;
  }

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

export function filterAndSortProducts(products: Product[], filters: FilterState): Product[] {
  return products.filter((p) => matchesFilters(p, filters)).sort(compareProducts(filters.sort));
}
