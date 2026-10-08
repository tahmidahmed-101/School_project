import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  DEFAULT_FILTERS,
  PRICE_STEP,
  countActiveFilters,
  filterAndSortProducts,
  parseStockType,
  priceBounds,
  shopKindFor,
} from "../shop-filters";

const products = [
  makeProduct({ id: "1", name: { en: "Cheap Bag", bn: "" }, price: 300, category: "bags", featured: true }),
  makeProduct({
    id: "2",
    name: { en: "Pricey Bag", bn: "" },
    price: 1200,
    compareAtPrice: 1500,
    category: "bags",
    trending: true,
  }),
  makeProduct({
    id: "3",
    name: { en: "Gold Cuff", bn: "" },
    price: 800,
    category: "jewellery",
    newArrival: true,
    inStock: false,
  }),
  makeProduct({
    id: "4",
    name: { en: "Earbuds", bn: "" },
    price: 900,
    category: "gadgets",
    isPreOrder: true,
    kind: "preorder",
  }),
];
const ids = (list: { id: string }[]) => list.map((p) => p.id);

describe("parseStockType", () => {
  it("only shows pre-orders when explicitly asked", () => {
    expect(parseStockType("preorder")).toBe("preorder");
    expect(parseStockType("anything")).toBe("normal");
    expect(parseStockType(null)).toBe("normal");
  });
});

describe("filterAndSortProducts", () => {
  it("hides pre-order items by default and shows only them for stockType preorder", () => {
    expect(ids(filterAndSortProducts(products, DEFAULT_FILTERS)).sort()).toEqual(["1", "2", "3"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, stockType: "preorder" }))).toEqual(["4"]);
  });

  it("filters by category case-insensitively", () => {
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, category: "BAGS" })).sort()).toEqual(["1", "2"]);
  });

  it("filters by collection", () => {
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, collection: "trending" }))).toEqual(["2"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, collection: "sale" }))).toEqual(["2"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, collection: "new" }))).toEqual(["3"]);
  });

  it("applies the price cap and the in-stock switch", () => {
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, maxPrice: 800 })).sort()).toEqual(["1", "3"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, inStockOnly: true })).sort()).toEqual(["1", "2"]);
  });

  it("searches names and category names", () => {
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, searchQuery: "cuff" }))).toEqual(["3"]);
  });

  it("sorts by price and by name", () => {
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, sort: "price-asc" }))).toEqual(["1", "3", "2"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, sort: "price-desc" }))).toEqual(["2", "3", "1"]);
    expect(ids(filterAndSortProducts(products, { ...DEFAULT_FILTERS, sort: "name-asc" }))).toEqual(["1", "3", "2"]);
  });

  it("puts featured products first by default", () => {
    expect(filterAndSortProducts(products, DEFAULT_FILTERS)[0]?.id).toBe("1");
  });

  it("does not mutate its input", () => {
    const copy = [...products];
    filterAndSortProducts(products, { ...DEFAULT_FILTERS, sort: "price-desc" });
    expect(products).toEqual(copy);
  });
});

describe("priceBounds", () => {
  it("rounds outwards to the slider step", () => {
    expect(priceBounds(products)).toEqual({ min: 300, max: 1200 });
    expect(priceBounds([makeProduct({ price: 333 }), makeProduct({ price: 777 })])).toEqual({ min: 300, max: 800 });
  });

  it("never returns a zero-width range", () => {
    expect(priceBounds([makeProduct({ price: 500 })])).toEqual({ min: 500, max: 500 + PRICE_STEP });
  });

  it("falls back to a default range for an empty catalogue", () => {
    expect(priceBounds([])).toEqual({ min: 0, max: PRICE_STEP * 20 });
  });
});

describe("countActiveFilters", () => {
  it("counts only filters that narrow the list", () => {
    expect(countActiveFilters(DEFAULT_FILTERS)).toBe(0);
    expect(
      countActiveFilters({ ...DEFAULT_FILTERS, searchQuery: "x", category: "bags", maxPrice: 500, inStockOnly: true }),
    ).toBe(4);
  });
});

describe("shopKindFor", () => {
  it("follows the type in the URL, and the category's own shop when one is named", () => {
    expect(shopKindFor(undefined)).toBe("stock");
    expect(shopKindFor("preorder")).toBe("preorder");
    expect(shopKindFor(["preorder"])).toBe("stock");
    expect(shopKindFor(undefined, { type: "preorder" })).toBe("preorder");
    expect(shopKindFor("preorder", { type: "stock" })).toBe("stock");
  });
});

describe("in stock only", () => {
  const preorderShop = { ...DEFAULT_FILTERS, stockType: "preorder" as const, inStockOnly: true };

  it("is not a pre-order shop filter: it neither hides pre-orders nor counts as active", () => {
    const closed = makeProduct({ id: "9", kind: "preorder", inStock: false });
    expect(filterAndSortProducts([closed], preorderShop)).toHaveLength(1);
    expect(countActiveFilters(preorderShop)).toBe(0);
    expect(countActiveFilters({ ...DEFAULT_FILTERS, inStockOnly: true })).toBe(1);
  });
});
