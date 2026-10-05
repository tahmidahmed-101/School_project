import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import { absoluteUrl } from "@/lib/site-url";
import { buildProductFeed } from "../product-feed";

const imageLinks = (feed: string) => [...feed.matchAll(/<g:(?:additional_)?image_link>(.*?)<\//g)].map((m) => m[1]);

describe("buildProductFeed", () => {
  it("leaves remote image URLs as they are and makes local ones absolute", () => {
    const feed = buildProductFeed([
      makeProduct({ gallery: ["https://api.kullmart.com/media/uploads/a.jpg", "/catalog/b.jpg"] }),
    ]);
    expect(imageLinks(feed)).toEqual(["https://api.kullmart.com/media/uploads/a.jpg", absoluteUrl("/catalog/b.jpg")]);
  });
});
