import { describe, expect, it } from "vitest";
import { pageShopKind } from "../page-kind";

describe("pageShopKind", () => {
  it("is the pre-order shop on the pre-order home page", () => {
    expect(pageShopKind({ pathname: "/pre-order" })).toBe("preorder");
  });

  it("reads a shop listing from its type, and from its category before its type", () => {
    expect(pageShopKind({ pathname: "/shop" })).toBe("stock");
    expect(pageShopKind({ pathname: "/shop", type: "preorder" })).toBe("preorder");
    expect(pageShopKind({ pathname: "/shop", type: "anything" })).toBe("stock");
    expect(pageShopKind({ pathname: "/shop", category: { type: "preorder" } })).toBe("preorder");
    expect(pageShopKind({ pathname: "/shop", type: "preorder", category: { type: "stock" } })).toBe("stock");
  });

  it("follows the product on a product page, and is the stock shop until the product is known", () => {
    expect(pageShopKind({ pathname: "/product/earbuds", product: "preorder" })).toBe("preorder");
    expect(pageShopKind({ pathname: "/product/bag", product: "stock" })).toBe("stock");
    expect(pageShopKind({ pathname: "/product/earbuds", product: null })).toBe("stock");
  });

  it("follows the basket at checkout", () => {
    expect(pageShopKind({ pathname: "/checkout", basket: "preorder" })).toBe("preorder");
    expect(pageShopKind({ pathname: "/checkout", basket: "stock" })).toBe("stock");
    expect(pageShopKind({ pathname: "/checkout", basket: "mixed" })).toBe("stock");
    expect(pageShopKind({ pathname: "/checkout", basket: null })).toBe("stock");
  });

  it("is the stock shop everywhere else, whatever the URL or the basket carries", () => {
    for (const pathname of ["/", "/login", "/track-order", "/shipping-policy", "/pre-orders", "/shopping"]) {
      expect(pageShopKind({ pathname, type: "preorder", product: "preorder", basket: "preorder" })).toBe("stock");
    }
  });
});
