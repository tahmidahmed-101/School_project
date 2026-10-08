import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import {
  getDiscountPercent,
  getMaxOrderQuantity,
  isPreOrderSoldOut,
  matchesQuery,
  searchByKind,
  searchProducts,
  shopHome,
  shopListing,
  productKind,
  splitByKind,
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

  it("treats a zero cap as sold out and zero reservations as open", () => {
    expect(
      isPreOrderSoldOut(makeProduct({ isPreOrder: true, maxPreorderQuantity: 0, currentPreorderQuantity: 0 })),
    ).toBe(true);
    expect(
      isPreOrderSoldOut(makeProduct({ isPreOrder: true, maxPreorderQuantity: 5, currentPreorderQuantity: 0 })),
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

  it("uses the full cap when nothing is reserved yet", () => {
    expect(
      getMaxOrderQuantity(makeProduct({ isPreOrder: true, maxPreorderQuantity: 4, currentPreorderQuantity: 0 })),
    ).toBe(4);
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
      ["category", "categoryName", "id", "image", "kind", "name", "price", "slug", "tagline"].sort(),
    );
  });
});

describe("productKind", () => {
  it("is the product's shop, read from the pre-order flag when an old saved product has none", () => {
    expect(productKind(makeProduct())).toBe("stock");
    expect(productKind(makeProduct({ kind: "preorder" }))).toBe("preorder");
    expect(productKind({ isPreOrder: true })).toBe("preorder");
    expect(productKind({})).toBe("stock");
  });
});

describe("splitByKind", () => {
  it("keeps a saved list as two lists, one per shop", () => {
    const saved = [makeProduct({ id: "a" }), makeProduct({ id: "b", kind: "preorder" }), makeProduct({ id: "c" })];
    const { stock, preorder } = splitByKind(saved, productKind);
    expect(stock.map((p) => p.id)).toEqual(["a", "c"]);
    expect(preorder.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("shop links", () => {
  it("keeps every link inside its own shop", () => {
    expect(shopHome("stock")).toBe("/shop");
    expect(shopHome("preorder")).toBe("/pre-order");
    expect(shopListing("stock")).toBe("/shop");
    expect(shopListing("stock", { q: "bag" })).toBe("/shop?q=bag");
    expect(shopListing("preorder")).toBe("/shop?type=preorder");
    expect(shopListing("preorder", { q: "ear buds" })).toBe("/shop?type=preorder&q=ear+buds");
  });
});

describe("searchByKind", () => {
  const entries = [
    makeProduct({ id: "1", name: { en: "Leather Bag", bn: "" } }),
    makeProduct({ id: "2", name: { en: "Travel Bag", bn: "" }, kind: "preorder" }),
    makeProduct({ id: "3", name: { en: "Tote Bag", bn: "" } }),
    makeProduct({ id: "4", name: { en: "Gold Cuff", bn: "" }, kind: "preorder" }),
  ].map(toSearchEntry);

  it("carries the kind on each entry", () => {
    expect(entries.map((e) => e.kind)).toEqual(["stock", "preorder", "stock", "preorder"]);
  });

  it("groups matches by shop and limits each group on its own", () => {
    const found = searchByKind(entries, "bag", 1);
    expect(found.stock.map((e) => e.id)).toEqual(["1"]);
    expect(found.preorder.map((e) => e.id)).toEqual(["2"]);
  });

  it("leaves a shop's group empty when nothing of that kind matches", () => {
    expect(searchByKind(entries, "cuff", 5)).toMatchObject({ stock: [], preorder: [{ id: "4" }] });
    expect(searchByKind(entries, " ", 5)).toEqual({ stock: [], preorder: [] });
  });
});
