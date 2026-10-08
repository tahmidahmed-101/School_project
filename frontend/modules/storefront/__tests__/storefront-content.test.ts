import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import type { ApiHeroSlide, ApiStorefrontContent } from "@/lib/api/types";
import { HERO_SLIDES, PROMO_LINES } from "../domain/hero-content";
import { hasDiscountedProduct, heroSlidesFor, promoLinesFor, toStorefrontContent } from "../domain/storefront-content";

const apiSlide = (overrides: Partial<ApiHeroSlide> = {}): ApiHeroSlide => ({
  id: "s1",
  image: "https://api.example.test/media/hero/s1.jpg",
  alt: "A slide",
  tag: { en: "TAG", bn: "ট্যাগ" },
  title: { en: "Title", bn: "শিরোনাম" },
  link_url: "",
  placement: "both",
  ...overrides,
});

const content = (api: Partial<ApiStorefrontContent>) =>
  toStorefrontContent({ hero_slides: [], promo_lines: [], ...api });

describe("heroSlidesFor", () => {
  const managed = content({
    hero_slides: [
      apiSlide({ id: "home", placement: "home" }),
      apiSlide({ id: "pre", placement: "preorder" }),
      apiSlide({ id: "both", placement: "both" }),
    ],
  });

  it("picks each page's slides in the order the API sent them", () => {
    expect(heroSlidesFor("home", managed).map((s) => s.id)).toEqual(["home", "both"]);
    expect(heroSlidesFor("preorder", managed).map((s) => s.id)).toEqual(["pre", "both"]);
  });

  it("uses the built-in slides when the page has none or the API failed", () => {
    const homeOnly = content({ hero_slides: [apiSlide({ placement: "home" })] });
    expect(heroSlidesFor("preorder", homeOnly)).toBe(HERO_SLIDES);
    expect(heroSlidesFor("home", content({}))).toBe(HERO_SLIDES);
    expect(heroSlidesFor("home", null)).toBe(HERO_SLIDES);
  });
});

describe("toStorefrontContent", () => {
  it("falls back to English when the Bangla value is empty", () => {
    const [slide] = content({
      hero_slides: [apiSlide({ tag: { en: "TAG", bn: "" }, title: { en: "Title", bn: "  " } })],
    }).heroSlides;
    expect(slide.tag).toEqual({ en: "TAG", bn: "TAG" });
    expect(slide.title).toEqual({ en: "Title", bn: "Title" });
  });

  it("keeps empty tags and titles empty so they are not rendered", () => {
    const [slide] = content({
      hero_slides: [apiSlide({ tag: { en: "", bn: "" }, title: { en: "", bn: "" } })],
    }).heroSlides;
    expect(slide.tag).toEqual({ en: "", bn: "" });
    expect(slide.title).toEqual({ en: "", bn: "" });
  });

  it("keeps site paths and http(s) links, and drops anything else so the page default applies", () => {
    const links = ["/shop?category=bags", "https://example.test/sale", "", "javascript:alert(1)", "//evil.test"];
    const slides = content({
      hero_slides: links.map((link_url, i) => apiSlide({ id: "s" + i, link_url })),
    }).heroSlides;
    expect(slides.map((s) => s.linkUrl)).toEqual([
      "/shop?category=bags",
      "https://example.test/sale",
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("drops slides without an image", () => {
    expect(content({ hero_slides: [apiSlide({ image: "" })] }).heroSlides).toEqual([]);
  });
});

describe("promoLinesFor", () => {
  it("uses the API's lines, with Bangla falling back to English", () => {
    const managed = content({
      promo_lines: [
        { id: "1", text: { en: "First", bn: "প্রথম" } },
        { id: "2", text: { en: "Second", bn: "" } },
        { id: "3", text: { en: "", bn: "" } },
      ],
    });
    expect(promoLinesFor(managed)).toEqual([
      { en: "First", bn: "প্রথম" },
      { en: "Second", bn: "Second" },
    ]);
  });

  it("uses the built-in lines when there are none or the API failed", () => {
    expect(promoLinesFor(content({}))).toBe(PROMO_LINES);
    expect(promoLinesFor(null)).toBe(PROMO_LINES);
  });

  it("makes no free-delivery claim in the built-in lines", () => {
    expect(PROMO_LINES.some((line) => /free delivery/i.test(line.en) || line.bn.includes("ফ্রি ডেলিভারি"))).toBe(false);
  });
});

describe("hasDiscountedProduct", () => {
  it("is true only when a product sells below its compare-at price", () => {
    expect(hasDiscountedProduct([])).toBe(false);
    expect(hasDiscountedProduct([makeProduct(), makeProduct({ price: 500, compareAtPrice: 500 })])).toBe(false);
    expect(hasDiscountedProduct([makeProduct(), makeProduct({ price: 400, compareAtPrice: 500 })])).toBe(true);
  });
});
