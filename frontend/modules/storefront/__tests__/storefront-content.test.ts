import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import type { ApiHeroSlide, ApiPromotionPopup, ApiStorefrontContent } from "@/lib/api/types";
import {
  hasDiscountedProduct,
  heroSlidesFor,
  pickPromotionPopup,
  promoLinesFor,
  toPromotionPopup,
  toStorefrontContent,
} from "../domain/storefront-content";

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
    hero_slides: [apiSlide({ id: "home", placement: "home" }), apiSlide({ id: "both", placement: "both" })],
  });

  it("picks the home page's slides in the order the API sent them", () => {
    expect(heroSlidesFor(managed).map((s) => s.id)).toEqual(["home", "both"]);
  });

  it("has no slides when the page has none or the API failed", () => {
    expect(heroSlidesFor(content({}))).toEqual([]);
    expect(heroSlidesFor(null)).toEqual([]);
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
        { id: "1", text: { en: "First", bn: "প্রথম" }, placement: "both" },
        { id: "2", text: { en: "Second", bn: "" }, placement: "both" },
        { id: "3", text: { en: "", bn: "" }, placement: "both" },
      ],
    });
    expect(promoLinesFor(managed)).toEqual([
      { en: "First", bn: "প্রথম" },
      { en: "Second", bn: "Second" },
    ]);
  });

  it("has no lines when there are none or the API failed", () => {
    expect(promoLinesFor(content({}))).toEqual([]);
    expect(promoLinesFor(null)).toEqual([]);
  });

  it("keeps only the lines placed on the home page", () => {
    const managed = content({
      promo_lines: [
        { id: "1", text: { en: "Home only", bn: "" }, placement: "home" },
        { id: "3", text: { en: "Everywhere", bn: "" }, placement: "both" },
      ],
    });
    expect(promoLinesFor(managed).map((line) => line.en)).toEqual(["Home only", "Everywhere"]);
  });
});

describe("hasDiscountedProduct", () => {
  it("is true only when a product sells below its compare-at price", () => {
    expect(hasDiscountedProduct([])).toBe(false);
    expect(hasDiscountedProduct([makeProduct(), makeProduct({ price: 500, compareAtPrice: 500 })])).toBe(false);
    expect(hasDiscountedProduct([makeProduct(), makeProduct({ price: 400, compareAtPrice: 500 })])).toBe(true);
  });

  it("counts a product whose price a sale lowered", () => {
    const sale = { name: "Eid Sale", percentOff: 20 };
    const onSale = makeProduct({ price: 800, compareAtPrice: 1000, salePrice: 800, sale });
    expect(hasDiscountedProduct([makeProduct(), onSale])).toBe(true);
  });
});

const apiPopup = (overrides: Partial<ApiPromotionPopup> = {}): ApiPromotionPopup => ({
  id: "p1",
  image: "https://api.example.test/media/promotions/p1.png",
  href: "/product/panjabi",
  shop: "stock",
  starts_at: "2026-10-01T00:00:00Z",
  ends_at: null,
  sale: { name: "Eid offer", percent_off: "25.00", ends_at: "2026-11-01T00:00:00+06:00" },
  ...overrides,
});

describe("toPromotionPopup", () => {
  it("reads the image, link, schedule and sale", () => {
    expect(toPromotionPopup(apiPopup())).toEqual({
      id: "p1",
      image: "https://api.example.test/media/promotions/p1.png",
      href: "/product/panjabi",
      startsAt: Date.parse("2026-10-01T00:00:00Z"),
      endsAt: null,
      sale: { name: "Eid offer", percentOff: 25 },
    });
  });

  it("has no sale for a destination other than the campaign page", () => {
    expect(toPromotionPopup(apiPopup({ sale: null }))).not.toHaveProperty("sale");
  });

  it("is null without an image, or with a link that is not a site path or http(s) address", () => {
    expect(toPromotionPopup(apiPopup({ image: "" }))).toBeNull();
    expect(toPromotionPopup(apiPopup({ href: "javascript:alert(1)" }))).toBeNull();
    expect(toPromotionPopup(apiPopup({ href: "//evil.example" }))).toBeNull();
    expect(toPromotionPopup(apiPopup({ href: "https://schoolproject.com/x" }))?.href).toBe(
      "https://schoolproject.com/x",
    );
  });

  it("keeps a popup with no destination, without a link", () => {
    expect(toPromotionPopup(apiPopup({ href: null }))?.href).toBeNull();
  });

  it("is read into the content in the API's order, leaving unusable ones out", () => {
    const popups = content({
      promotion_popups: [apiPopup({ id: "a" }), apiPopup({ id: "bad", image: "" }), apiPopup({ id: "b" })],
    }).promotionPopups;
    expect(popups.map((popup) => popup.id)).toEqual(["a", "b"]);
    expect(content({}).promotionPopups).toEqual([]);
  });
});

describe("pickPromotionPopup", () => {
  const popups = (...overrides: Partial<ApiPromotionPopup>[]) =>
    content({ promotion_popups: overrides.map((o) => apiPopup(o)) }).promotionPopups;
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("skips one that has not started or has ended, since the API answer may be cached", () => {
    const list = popups(
      { id: "later", starts_at: "2026-10-20T00:00:00Z" },
      { id: "over", starts_at: null, ends_at: "2026-10-19T11:59:00Z" },
      { id: "open", starts_at: null, ends_at: "2026-10-19T12:01:00Z" },
    );
    expect(pickPromotionPopup(list, now)?.id).toBe("open");
  });

  it("prefers the first eligible one, which the API orders by priority", () => {
    expect(pickPromotionPopup(popups({ id: "high" }, { id: "low" }), now)?.id).toBe("high");
  });
});
