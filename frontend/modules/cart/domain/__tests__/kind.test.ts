import { describe, expect, it } from "vitest";
import type { CartItem, Product } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { acceptsProduct, basketGroups, basketKind } from "../kind";

const line = (overrides: Partial<Product>, quantity = 1): CartItem => ({
  product: makeProduct(overrides),
  quantity,
  variantId: `v-${overrides.id ?? "1"}`,
});

const stock = line({ id: "s", price: 100 }, 2);
const preorder = line({ id: "p", price: 900, kind: "preorder", isPreOrder: true }, 3);

describe("basketKind", () => {
  it("is the kind of the lines it holds", () => {
    expect(basketKind([])).toBeNull();
    expect(basketKind([stock])).toBe("stock");
    expect(basketKind([preorder])).toBe("preorder");
    expect(basketKind([stock, preorder])).toBe("mixed");
  });

  it("reads a line saved before products carried a kind from its pre-order flag", () => {
    const legacy = line({ id: "old", kind: undefined, isPreOrder: true });
    expect(basketKind([legacy])).toBe("preorder");
  });
});

describe("acceptsProduct", () => {
  it("takes anything into an empty basket", () => {
    expect(acceptsProduct([], stock.product)).toBe(true);
    expect(acceptsProduct([], preorder.product)).toBe(true);
  });

  it("refuses the other kind", () => {
    expect(acceptsProduct([stock], preorder.product)).toBe(false);
    expect(acceptsProduct([preorder], stock.product)).toBe(false);
    expect(acceptsProduct([stock], makeProduct({ id: "s2" }))).toBe(true);
  });

  it("takes nothing more into a basket that already holds both", () => {
    expect(acceptsProduct([stock, preorder], stock.product)).toBe(false);
  });
});

describe("basketGroups", () => {
  it("counts and totals each kind on its own", () => {
    expect(basketGroups([stock, preorder])).toEqual([
      { kind: "stock", items: [stock], totalItems: 2, subtotal: 200 },
      { kind: "preorder", items: [preorder], totalItems: 3, subtotal: 2700 },
    ]);
  });

  it("has one group for a single-kind basket and none when empty", () => {
    expect(basketGroups([stock]).map((group) => group.kind)).toEqual(["stock"]);
    expect(basketGroups([])).toEqual([]);
  });
});
