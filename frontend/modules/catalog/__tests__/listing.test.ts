import { describe, expect, it } from "vitest";
import type { Product } from "@/lib/types";
import { forListing } from "../domain/listing";

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
