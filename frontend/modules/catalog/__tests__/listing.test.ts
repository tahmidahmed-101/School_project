import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { makeProduct } from "@/tests/fixtures";
import { forListing, moreForProduct, relatedForProduct } from "../domain/listing";

describe("forListing", () => {
  it("keeps what cards and filters read and drops product-page detail", () => {
    const product = {
      id: "p1",
      slug: "shirt",
      name: { en: "Shirt", bn: "শার্ট" },
      description: { en: "Soft", bn: "Soft" },
      longDescription: { en: "Soft", bn: "Soft" },
      image: "a.jpg",
      gallery: ["a.jpg", "b.jpg", "c.jpg"],
      price: 500,
      specs: [{ label: { en: "Fit", bn: "Fit" }, value: { en: "Slim", bn: "Slim" } }],
      highlights: [{ en: "Cotton", bn: "Cotton" }],
      metaKeywords: "shirt",
    } as unknown as Product;

    const slim = forListing(product);

    expect(slim.name).toEqual(product.name);
    expect(slim.description).toEqual(product.description);
    expect(slim.price).toBe(500);
    expect(slim.gallery).toEqual(["a.jpg"]);
    expect(slim.longDescription.en).toBe("");
    expect(slim.specs).toBeUndefined();
    expect(slim.highlights).toBeUndefined();
  });
});

describe("relatedForProduct", () => {
  const product = makeProduct({ id: "p", category: "bags", kind: "preorder" });
  const samePreorder = makeProduct({ id: "a", category: "bags", kind: "preorder" });
  const stockPick = makeProduct({ id: "b", category: "bags", kind: "stock" });
  const otherCategory = makeProduct({ id: "c", category: "gadgets", kind: "preorder" });

  it("drops API picks from the other shop and the product itself", () => {
    const related = relatedForProduct(product, [stockPick, product, samePreorder, otherCategory], [], 4);
    expect(related.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("falls back to the same category, still within the product's shop", () => {
    const related = relatedForProduct(product, null, [product, stockPick, samePreorder, otherCategory], 4);
    expect(related.map((p) => p.id)).toEqual(["a"]);
  });

  it("returns at most the asked count", () => {
    expect(relatedForProduct(product, [samePreorder, otherCategory], [], 1)).toHaveLength(1);
  });
});

describe("moreForProduct", () => {
  const product = makeProduct({ id: "p", kind: "stock" });
  const related = makeProduct({ id: "r", kind: "stock" });
  const other = makeProduct({ id: "a", category: "gadgets", kind: "stock" });
  const another = makeProduct({ id: "b", kind: "stock" });
  const preorder = makeProduct({ id: "c", kind: "preorder" });

  it("lists the shop's other products, leaving out the product, its related picks and the other shop", () => {
    const more = moreForProduct(product, [related], [product, related, other, preorder, another], 12);
    expect(more.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("stops at the count", () => {
    expect(moreForProduct(product, [], [other, another], 1).map((p) => p.id)).toEqual(["a"]);
  });
});
