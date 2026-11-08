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
  const product = makeProduct({ id: "p", category: "bags" });
  const sameCategory = makeProduct({ id: "a", category: "bags" });
  const otherCategory = makeProduct({ id: "c", category: "gadgets" });

  it("keeps the API picks but drops the product itself", () => {
    const related = relatedForProduct(product, [product, sameCategory, otherCategory], [], 4);
    expect(related.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("falls back to the same category", () => {
    const related = relatedForProduct(product, null, [product, sameCategory, otherCategory], 4);
    expect(related.map((p) => p.id)).toEqual(["a"]);
  });

  it("returns at most the asked count", () => {
    expect(relatedForProduct(product, [sameCategory, otherCategory], [], 1)).toHaveLength(1);
  });
});

describe("moreForProduct", () => {
  const product = makeProduct({ id: "p" });
  const related = makeProduct({ id: "r" });
  const other = makeProduct({ id: "a", category: "gadgets" });
  const another = makeProduct({ id: "b" });

  it("lists the other products, leaving out the product and its related picks", () => {
    const more = moreForProduct(product, [related], [product, related, other, another], 12);
    expect(more.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("stops at the count", () => {
    expect(moreForProduct(product, [], [other, another], 1).map((p) => p.id)).toEqual(["a"]);
  });
});
