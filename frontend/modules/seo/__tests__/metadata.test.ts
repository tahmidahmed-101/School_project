import { describe, expect, it } from "vitest";
import { makeProduct, makeSku } from "@/tests/fixtures";
import { BRAND_INFO } from "@/lib/brand";
import {
  breadcrumbJsonLd,
  ogCardImage,
  organizationJsonLd,
  pageMetadata,
  productDescription,
  productJsonLd,
  truncate,
  websiteJsonLd,
} from "../metadata";

describe("truncate", () => {
  it("leaves short text alone and collapses whitespace", () => {
    expect(truncate("  a   short \n text ")).toBe("a short text");
  });

  it("cuts at a word boundary within the limit and adds an ellipsis", () => {
    const result = truncate("one two three four five six", 15);
    expect(result).toBe("one two three…");
    expect(result.length).toBeLessThanOrEqual(15);
  });

  it("does not leave trailing punctuation before the ellipsis", () => {
    expect(truncate("alpha, beta, gamma delta", 14)).toBe("alpha, beta…");
  });
});

describe("pageMetadata", () => {
  it("sets the canonical to the path, and repeats title and description in the social cards", () => {
    const meta = pageMetadata({ title: "Shop", description: "Browse", path: "/shop" });
    expect(meta.alternates).toEqual({ canonical: "/shop" });
    expect(meta.title).toBe("Shop");
    expect(meta.openGraph).toMatchObject({ url: "/shop", title: "Shop | Kull Mart", description: "Browse" });
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", description: "Browse" });
  });

  it("uses an explicit canonical when the page is a filtered view of another URL", () => {
    const meta = pageMetadata({ description: "d", path: "/shop?type=preorder", canonical: "/pre-order" });
    expect(meta.alternates).toEqual({ canonical: "/pre-order" });
    expect(meta.openGraph).toMatchObject({ url: "/shop?type=preorder" });
  });

  it("omits the title on the home page so the layout default applies", () => {
    expect(pageMetadata({ description: "d", path: "/" })).not.toHaveProperty("title");
  });

  it("splits comma-separated keywords and omits them when blank", () => {
    expect(pageMetadata({ description: "d", path: "/", keywords: " watch, , smart watch " }).keywords).toEqual([
      "watch",
      "smart watch",
    ]);
    expect(pageMetadata({ description: "d", path: "/", keywords: "" })).not.toHaveProperty("keywords");
  });
});

describe("productDescription", () => {
  it("keeps a description that is long enough, trimmed to the limit", () => {
    const long = "A long enough description of the product that already says plenty about it. ".repeat(4);
    const result = productDescription(makeProduct({ description: { en: long, bn: "" } }));
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.startsWith("A long enough description")).toBe(true);
  });

  it("adds the store sentence to a one-word description", () => {
    const result = productDescription(
      makeProduct({ description: { en: "churi", bn: "" }, tagline: { en: "", bn: "" } }),
    );
    expect(result).toBe("churi. Order online from Kull Mart with delivery all across Bangladesh.");
    expect(result.length).toBeGreaterThanOrEqual(50);
  });

  it("drops trailing ! ? and ellipsis before the store sentence, and returns nothing for an empty record", () => {
    const blank = { en: "", bn: "" };
    expect(productDescription(makeProduct({ description: { en: "Wow!?…", bn: "" } }))).toMatch(/^Wow\. Order online/);
    expect(productDescription(makeProduct({ name: blank, description: blank, tagline: blank }))).toBe("");
  });

  it("falls back to the tagline, then the name, when there is no description", () => {
    const blank = { en: "", bn: "" };
    expect(productDescription(makeProduct({ description: blank, tagline: { en: "Glass bangles", bn: "" } }))).toMatch(
      /^Glass bangles\. Order online/,
    );
    expect(productDescription(makeProduct({ description: blank, tagline: blank }))).toMatch(
      /^Test Product\. Order online/,
    );
  });
});

describe("ogCardImage", () => {
  it("points a page with a real photo at its own 1200x630 card", () => {
    expect(ogCardImage("product", "a b", "https://api.kullmart.com/media/x.webp", "Alt")).toEqual({
      url: "/og/product/a%20b",
      alt: "Alt",
      width: 1200,
      height: 630,
    });
  });

  it("uses the site image when the photo is the local placeholder", () => {
    expect(ogCardImage("category", "tools", "/brand/category-placeholder.png", "Tools").url).toBe(
      "/brand/og-default.jpg",
    );
  });
});

describe("breadcrumbJsonLd", () => {
  it("numbers the trail from 1 with absolute item URLs", () => {
    const ld = breadcrumbJsonLd([
      { name: "Home", path: "/" },
      { name: "Shop", path: "/shop" },
    ]) as { itemListElement: { position: number; name: string; item: string }[] };
    expect(ld.itemListElement.map((i) => [i.position, i.name])).toEqual([
      [1, "Home"],
      [2, "Shop"],
    ]);
    expect(ld.itemListElement[1]!.item).toMatch(/\/shop$/);
  });
});

describe("organizationJsonLd", () => {
  it("lists every social profile the brand has, and none it lacks", () => {
    const brand = {
      ...BRAND_INFO,
      social: {
        instagram: "https://instagram.com/kullmartbd",
        tiktok: "",
        youtube: "https://youtube.com/@km",
        linkedin: "",
      },
    };
    expect(organizationJsonLd(brand).sameAs).toEqual([
      BRAND_INFO.facebook,
      "https://instagram.com/kullmartbd",
      "https://youtube.com/@km",
    ]);
    expect(organizationJsonLd().sameAs).toEqual([BRAND_INFO.facebook]);
  });

  it("names the organisation from the merged brand", () => {
    const ld = organizationJsonLd({ ...BRAND_INFO, name: "Kull Mart BD", legalName: "Kull Mart Trading" });
    expect(ld).toMatchObject({ name: "Kull Mart BD", legalName: "Kull Mart Trading" });
  });
});

describe("websiteJsonLd", () => {
  it("declares a site search action", () => {
    const ld = websiteJsonLd() as {
      "@type": string;
      potentialAction: { "@type": string; target: { urlTemplate: string } };
    };
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.potentialAction.target.urlTemplate).toContain("/shop?q={search_term_string}");
  });
});

describe("productJsonLd", () => {
  const offer = (product = makeProduct()) =>
    (productJsonLd(product) as { offers: { availability: string; price: number; priceCurrency: string } }).offers;

  it("describes the offer in BDT with the current price", () => {
    expect(offer(makeProduct({ price: 650 }))).toMatchObject({ price: 650, priceCurrency: "BDT" });
  });

  it("reports availability for stock, out-of-stock and pre-order products", () => {
    expect(offer().availability).toBe("https://schema.org/InStock");
    expect(offer(makeProduct({ inStock: false, stockCount: 0 })).availability).toBe("https://schema.org/OutOfStock");
    expect(offer(makeProduct({ isPreOrder: true, skuVariants: [makeSku({ isPreOrder: true })] })).availability).toBe(
      "https://schema.org/PreOrder",
    );
    expect(offer(makeProduct({ isPreOrder: true, preorderStatus: "sold-out" })).availability).toBe(
      "https://schema.org/OutOfStock",
    );
  });

  it("only emits a rating when there are real reviews", () => {
    expect(productJsonLd(makeProduct())).not.toHaveProperty("aggregateRating");
    expect(productJsonLd(makeProduct({ rating: 4.5, reviewCount: 12 }))).toMatchObject({
      aggregateRating: { ratingValue: 4.5, reviewCount: 12 },
    });
  });

  it("is valid JSON-LD for a Product, with absolute image URLs", () => {
    const ld = productJsonLd(makeProduct({ gallery: ["/catalog/a.jpg", "https://cdn.test/b.jpg"] })) as {
      "@context": string;
      "@type": string;
      image: string[];
      sku: string;
    };
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Product");
    expect(ld.image[0]).toMatch(/^https?:\/\/.+\/catalog\/a\.jpg$/);
    expect(ld.image[1]).toBe("https://cdn.test/b.jpg");
  });
});
