import type { ApiHeroSlide, ApiStorefrontContent } from "@/lib/api/types";
import type { Product, T } from "@/lib/types";
import { getDiscountPercent } from "@/lib/product";
import { HERO_SLIDES, PROMO_LINES, type HeroSlide } from "./hero-content";

export type HeroPage = "home" | "preorder";

export interface ManagedHeroSlide extends HeroSlide {
  placement: ApiHeroSlide["placement"];
}

/** Hero slides and promo lines published in the dashboard. */
export interface StorefrontContent {
  heroSlides: ManagedHeroSlide[];
  promoLines: { text: T; placement: ApiHeroSlide["placement"] }[];
}

function localized(value: Partial<T> | null | undefined): T {
  const en = value?.en?.trim() ?? "";
  return { en, bn: value?.bn?.trim() || en };
}

/** Site paths and http(s) addresses only, so a mistyped value can never become a script or mail link. */
function safeLink(value: string | null | undefined): string | undefined {
  const link = value?.trim() ?? "";
  if (/^https?:\/\//i.test(link)) return link;
  return link.startsWith("/") && !link.startsWith("//") ? link : undefined;
}

export function toStorefrontContent(api: ApiStorefrontContent): StorefrontContent {
  return {
    heroSlides: (api.hero_slides ?? [])
      .filter((slide) => Boolean(slide.image))
      .map((slide) => ({
        id: slide.id,
        image: slide.image,
        alt: slide.alt ?? "",
        tag: localized(slide.tag),
        title: localized(slide.title),
        linkUrl: safeLink(slide.link_url),
        placement: slide.placement,
      })),
    promoLines: (api.promo_lines ?? [])
      .map((line) => ({ text: localized(line.text), placement: line.placement ?? "both" }))
      .filter((line) => line.text.en !== ""),
  };
}

/** The dashboard's slides for a page, or the built-in ones when it has none (or the API could not be read). */
export function heroSlidesFor(page: HeroPage, content: StorefrontContent | null): HeroSlide[] {
  const managed = (content?.heroSlides ?? []).filter((slide) => slide.placement === page || slide.placement === "both");
  return managed.length > 0 ? managed : HERO_SLIDES;
}

export function promoLinesFor(page: HeroPage, content: StorefrontContent | null): T[] {
  const managed = (content?.promoLines ?? []).filter((line) => line.placement === page || line.placement === "both");
  return managed.length > 0 ? managed.map((line) => line.text) : PROMO_LINES;
}

/** Same test as the shop's "sale" collection, so the offers tile never leads to a list with no offers in it. */
export function hasDiscountedProduct(products: Product[]): boolean {
  return products.some((product) => getDiscountPercent(product) !== null);
}
