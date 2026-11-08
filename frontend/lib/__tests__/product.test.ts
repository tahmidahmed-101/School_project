import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  getDiscountPercent,
  getMaxOrderQuantity,
  getSaleOffer,
  matchesQuery,
  searchProducts,
  shopListing,
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

describe("getSaleOffer", () => {
  const sale = { name: "Eid Sale", percentOff: 20 };

  it("names the sale on a stock product whose SKU it covers", () => {
    expect(getSaleOffer(makeProduct({ sale, salePrice: 400 }))).toBe(sale);
  });

  it("is null without a sale and for an uncovered SKU", () => {
    expect(getSaleOffer(makeProduct())).toBeNull();
    expect(getSaleOffer(makeProduct({ sale }))).toBeNull();
  });
});

describe("getMaxOrderQuantity", () => {
  it("uses stock", () => {
    expect(getMaxOrderQuantity(makeProduct({ stockCount: 7 }))).toBe(7);
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

describe("shopListing", () => {
  it("builds a /shop link with its query", () => {
    expect(shopListing()).toBe("/shop");
    expect(shopListing({ q: "bag" })).toBe("/shop?q=bag");
    expect(shopListing({ q: "ear buds" })).toBe("/shop?q=ear+buds");
  });
});
