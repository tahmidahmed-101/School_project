import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  getDiscountPercent,
  getMaxOrderQuantity,
  isPreOrderSoldOut,
  matchesQuery,
  searchProducts,
  toSearchEntry,
} from "../product";

describe("getDiscountPercent", () => {
  it("rounds the saving to a whole percentage", () => {
    expect(getDiscountPercent(makeProduct({ price: 750, compareAtPrice: 1000 }))).toBe(25);
    expect(getDiscountPercent(makeProduct({ price: 667, compareAtPrice: 1000 }))).toBe(33);
  });

  it("is null when there is no real discount", () => {
    expect(getDiscountPercent(makeProduct({ price: 500 }))).toBeNull();
    expect(getDiscountPercent(makeProduct({ price: 500, compareAtPrice: 500 }))).toBeNull();
    expect(getDiscountPercent(makeProduct({ price: 500, compareAtPrice: 400 }))).toBeNull();
  });
});

describe("isPreOrderSoldOut", () => {
  it("is false for regular products", () => {
    expect(isPreOrderSoldOut(makeProduct())).toBe(false);
  });

  it("is true when marked sold out or when reservations reach the cap", () => {
    expect(isPreOrderSoldOut(makeProduct({ isPreOrder: true, preorderStatus: "sold-out" }))).toBe(true);
    expect(
      isPreOrderSoldOut(makeProduct({ isPreOrder: true, maxPreorderQuantity: 10, currentPreorderQuantity: 10 })),
    ).toBe(true);
    expect(
      isPreOrderSoldOut(makeProduct({ isPreOrder: true, maxPreorderQuantity: 10, currentPreorderQuantity: 9 })),
    ).toBe(false);
  });
});

describe("getMaxOrderQuantity", () => {
  it("uses stock for regular products", () => {
    expect(getMaxOrderQuantity(makeProduct({ stockCount: 7 }))).toBe(7);
  });

  it("uses the remaining reservations for pre-orders, at least 1, and 10 when uncapped", () => {
    expect(
      getMaxOrderQuantity(makeProduct({ isPreOrder: true, maxPreorderQuantity: 20, currentPreorderQuantity: 15 })),
    ).toBe(5);
    expect(
      getMaxOrderQuantity(makeProduct({ isPreOrder: true, maxPreorderQuantity: 20, currentPreorderQuantity: 40 })),
    ).toBe(1);
    expect(getMaxOrderQuantity(makeProduct({ isPreOrder: true }))).toBe(10);
  });
});

describe("matchesQuery", () => {
  it("matches case-insensitively on any field and never on an empty query", () => {
    expect(matchesQuery(["Leather Wallet", "bags"], "WALLET")).toBe(true);
    expect(matchesQuery(["Leather Wallet"], "  ")).toBe(false);
    expect(matchesQuery(["Leather Wallet"], "purse")).toBe(false);
  });
});

describe("searchProducts", () => {
  const entries = ["Red Bag", "Blue Bag", "Green Bag", "Gold Cuff"].map((name, i) =>
    toSearchEntry(makeProduct({ id: String(i), name: { en: name, bn: name }, category: "misc" })),
  );

  it("returns nothing for an empty query", () => {
    expect(searchProducts(entries, "", 5)).toEqual([]);
  });

  it("filters by name and honours the limit", () => {
    expect(searchProducts(entries, "bag", 5)).toHaveLength(3);
    expect(searchProducts(entries, "bag", 2)).toHaveLength(2);
    expect(searchProducts(entries, "cuff", 5).map((e) => e.name.en)).toEqual(["Gold Cuff"]);
  });
});

describe("toSearchEntry", () => {
  it("keeps only the fields the header search needs", () => {
    const entry = toSearchEntry(makeProduct({ description: { en: "long text", bn: "long text" } }));
    expect(Object.keys(entry).sort()).toEqual(
      ["category", "categoryName", "id", "image", "name", "price", "slug", "tagline"].sort(),
    );
  });
});
