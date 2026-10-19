import { describe, expect, it } from "vitest";
import { makeProduct } from "@/tests/fixtures";
import type { ApiHeroSlide, ApiPreorderPopup, ApiPromotionPopup, ApiStorefrontContent } from "@/lib/api/types";
import {
  hasDiscountedProduct,
  heroSlidesFor,
  promoLinesFor,
  toPreorderPopup,
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

  it("has no slides when the page has none or the API failed", () => {
    const homeOnly = content({ hero_slides: [apiSlide({ placement: "home" })] });
    expect(heroSlidesFor("preorder", homeOnly)).toEqual([]);
    expect(heroSlidesFor("home", null)).toEqual([]);
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
    expect(promoLinesFor("home", managed)).toEqual([
      { en: "First", bn: "প্রথম" },
      { en: "Second", bn: "Second" },
    ]);
  });

  it("has no lines when there are none or the API failed", () => {
    expect(promoLinesFor("home", content({}))).toEqual([]);
    expect(promoLinesFor("preorder", null)).toEqual([]);
  });

  it("keeps a line on the page it was placed on", () => {
    const managed = content({
      promo_lines: [
        { id: "1", text: { en: "Stock only", bn: "" }, placement: "home" },
        { id: "2", text: { en: "Everywhere", bn: "" }, placement: "both" },
      ],
    });
    expect(promoLinesFor("preorder", managed).map((line) => line.en)).toEqual(["Everywhere"]);
    expect(promoLinesFor("home", managed).map((line) => line.en)).toEqual(["Stock only", "Everywhere"]);
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

describe("toPromotionPopup", () => {
  const apiPopup = (overrides: Partial<ApiPromotionPopup> = {}): ApiPromotionPopup => ({
    id: "p1",
    image: "https://api.example.test/media/promotions/p1.png",
    title: { en: "Eid sale", bn: "ঈদ সেল" },
    body: { en: "Up to 25% off", bn: "" },
    cta: { label: { en: "Shop now", bn: "এখনই কিনুন" }, url: "/shop?sale=eid" },
    sale: { name: "Eid offer", percent_off: "25.00", ends_at: "2026-11-01T00:00:00+06:00" },
    products: [
      {
        id: "a",
        name: "Panjabi",
        slug: "panjabi",
        image: "/catalog/panjabi.jpg",
        price: "750.00",
        original_price: "1000.00",
        percent_off: "25.00",
      },
    ],
    ...overrides,
  });

  it("reads content, sale and cards, falling back to English for blank Bangla", () => {
    expect(toPromotionPopup(apiPopup())).toEqual({
      id: "p1",
      image: "https://api.example.test/media/promotions/p1.png",
      title: { en: "Eid sale", bn: "ঈদ সেল" },
      body: { en: "Up to 25% off", bn: "Up to 25% off" },
      cta: { label: { en: "Shop now", bn: "এখনই কিনুন" }, url: "/shop?sale=eid" },
      sale: { name: "Eid offer", percentOff: 25, endsAt: "2026-11-01T00:00:00+06:00" },
      products: [
        {
          id: "a",
          name: "Panjabi",
          slug: "panjabi",
          image: "/catalog/panjabi.jpg",
          price: 750,
          originalPrice: 1000,
          percentOff: 25,
        },
      ],
    });
  });

  it("is null when the API sends none, an older API omits it, or it has no title", () => {
    expect(toPromotionPopup(null)).toBeNull();
    expect(content({}).promotionPopup).toBeNull();
    expect(toPromotionPopup(apiPopup({ title: { en: " ", bn: "" } }))).toBeNull();
  });

  it("shows a popup that features no products", () => {
    expect(toPromotionPopup(apiPopup({ products: [] }))).toMatchObject({ id: "p1", products: [] });
  });

  it("drops a card that is not actually cheaper than its list price", () => {
    const card = apiPopup().products[0]!;
    const popup = toPromotionPopup(apiPopup({ products: [card, { ...card, id: "b", slug: "b", price: "1000.00" }] }));
    expect(popup?.products.map((p) => p.id)).toEqual(["a"]);
  });

  it("drops a button whose link is unsafe or that has no label", () => {
    const label = { en: "Go", bn: "" };
    expect(toPromotionPopup(apiPopup({ cta: { label, url: "javascript:alert(1)" } }))?.cta).toBeUndefined();
    expect(toPromotionPopup(apiPopup({ cta: { label, url: "//evil.example" } }))?.cta).toBeUndefined();
    expect(toPromotionPopup(apiPopup({ cta: { label: { en: "", bn: "" }, url: "/shop" } }))?.cta).toBeUndefined();
    expect(toPromotionPopup(apiPopup({ cta: null }))?.cta).toBeUndefined();
  });
});

describe("toPreorderPopup", () => {
  const apiPopup = (overrides: Partial<ApiPreorderPopup> = {}): ApiPreorderPopup => ({
    id: "pre1",
    image: null,
    title: { en: "Winter pre-order", bn: "" },
    body: { en: "", bn: "" },
    cta: null,
    products: [
      {
        id: "a",
        name: "Puffer jacket",
        slug: "puffer-jacket",
        image: "/catalog/puffer.jpg",
        price: "850.00",
        original_price: "1000.00",
        release_date: "2026-12-01T00:00:00+06:00",
      },
    ],
    ...overrides,
  });

  it("reads cards with their pre-order price, list price and delivery date, and no sale", () => {
    const popup = toPreorderPopup(apiPopup());
    expect(popup?.sale).toBeUndefined();
    expect(popup?.products).toEqual([
      {
        id: "a",
        name: "Puffer jacket",
        slug: "puffer-jacket",
        image: "/catalog/puffer.jpg",
        price: 850,
        originalPrice: 1000,
        releaseDate: "2026-12-01T00:00:00+06:00",
      },
    ]);
  });

  it("shows no list price when there is none or it is not higher", () => {
    const card = apiPopup().products[0]!;
    const popup = toPreorderPopup(
      apiPopup({
        products: [
          { ...card, original_price: null, release_date: null },
          { ...card, id: "b", slug: "b", original_price: "850.00" },
        ],
      }),
    );
    expect(popup?.products.map((p) => [p.originalPrice, p.releaseDate])).toEqual([
      [undefined, undefined],
      [undefined, "2026-12-01T00:00:00+06:00"],
    ]);
  });

  it("is read into the content beside the shop popup, null when absent", () => {
    expect(content({ preorder_popup: apiPopup({ products: [] }) }).preorderPopup).toMatchObject({ id: "pre1" });
    expect(content({}).preorderPopup).toBeNull();
    expect(toPreorderPopup(apiPopup({ title: { en: "", bn: "" } }))).toBeNull();
  });
});
