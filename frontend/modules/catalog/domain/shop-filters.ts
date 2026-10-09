import type { Product } from "@/lib/types";
import { getDiscountPercent, isPreOrderShopProduct, matchesQuery } from "@/lib/product";

export interface FilterState {
  category: string;
  collection: string;
  maxPrice: number;
  inStockOnly: boolean;
  sort: string;
  searchQuery: string;
  /** "normal" (default) hides pre-order items, "preorder" shows only them. */
  stockType: StockType;
}

export type StockType = "normal" | "preorder";

export function parseStockType(value: string | null): StockType {
  // The shop hides pre-order items unless a type is explicitly requested.
  return value === "preorder" ? value : "normal";
}

/** Which shop a `/shop` URL shows: its `?type=`, unless it names a category, which belongs to one shop only. */
export function shopKindFor(type: unknown, category?: { type: "stock" | "preorder" }): "stock" | "preorder" {
  return category?.type ?? (type === "preorder" ? "preorder" : "stock");
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
  stockType: "normal",
};

/** "In stock only" is a stock-shop filter; a pre-order is never in stock. */
const appliesInStockOnly = (filters: FilterState) => filters.inStockOnly && filters.stockType === "normal";

/** Discounts are stock only, so the "sale" collection is not a pre-order filter either. */
export const appliesCollection = (filters: FilterState, collection: string) =>
  filters.collection === collection && (collection !== "sale" || filters.stockType === "normal");

/** How many filters (search, category, collection, price cap, stock) narrow the catalogue. */
export function countActiveFilters(filters: FilterState): number {
  return [
    Boolean(filters.searchQuery),
    filters.category !== "all",
    filters.collection !== "all" && appliesCollection(filters, filters.collection),
    Number.isFinite(filters.maxPrice),
    appliesInStockOnly(filters),
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

  if (filters.category !== "all" && product.category.toLowerCase() !== filters.category.toLowerCase()) {
    return false;
  }

  if (filters.stockType === "normal" && isPreOrderShopProduct(product)) return false;
  if (filters.stockType === "preorder" && !isPreOrderShopProduct(product)) return false;

  if (appliesCollection(filters, "trending") && !product.trending) return false;
  if (appliesCollection(filters, "sale") && getDiscountPercent(product) === null) return false;
  if (appliesCollection(filters, "new") && !product.newArrival) return false;

  if (product.price > filters.maxPrice) return false;
  if (appliesInStockOnly(filters) && !product.inStock) return false;

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
