import type { ApiHeroSlide, ApiPreorderPopup, ApiPromotionPopup, ApiStorefrontContent } from "@/lib/api/types";
import { toNumber } from "@/lib/api/parse";
import type { Product, T } from "@/lib/types";
import { getDiscountPercent } from "@/lib/product";
import type { HeroSlide } from "./hero-content";

export type HeroPage = "home" | "preorder";

export interface ManagedHeroSlide extends HeroSlide {
  placement: ApiHeroSlide["placement"];
}

/** Where a popup without its own link sends the shopper: the products the promotion is about. */
export const PROMOTION_POPUP_DEFAULT_LINK = { shop: "/shop?collection=sale", preorder: "/pre-order" } as const;

/** A dashboard popup the backend chose: one image and where clicking it goes. The shop one names its sale. */
export interface PromotionPopup {
  id: string;
  image: string;
  href: string;
  sale?: { name: string; percentOff: number };
}

/** Hero slides, promo lines and each shop page's popup, as published in the dashboard. */
export interface StorefrontContent {
  heroSlides: ManagedHeroSlide[];
  promoLines: { text: T; placement: ApiHeroSlide["placement"] }[];
  promotionPopup: PromotionPopup | null;
  preorderPopup: PromotionPopup | null;
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

/** The popup, or null without an image. An unsafe link falls back to `fallback`, so it can never become a script link. */
function toPopup(api: ApiPromotionPopup | ApiPreorderPopup, fallback: string): PromotionPopup | null {
  if (!api.image) return null;
  return { id: api.id, image: api.image, href: safeLink(api.link_url) ?? fallback };
}

/** The shop popup the backend chose, or null. Without a link it opens the products on sale. */
export function toPromotionPopup(api: ApiPromotionPopup | null | undefined): PromotionPopup | null {
  if (!api) return null;
  const popup = toPopup(api, PROMOTION_POPUP_DEFAULT_LINK.shop);
  return popup && { ...popup, sale: { name: api.sale?.name ?? "", percentOff: toNumber(api.sale?.percent_off ?? "0") } };
}

/** The pre-order page popup the backend chose, or null. Without a link it opens the pre-order products. */
export function toPreorderPopup(api: ApiPreorderPopup | null | undefined): PromotionPopup | null {
  return api ? toPopup(api, PROMOTION_POPUP_DEFAULT_LINK.preorder) : null;
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
      .map((line) => ({ text: localized(line.text), placement: line.placement }))
      .filter((line) => line.text.en !== ""),
    promotionPopup: toPromotionPopup(api.promotion_popup),
    preorderPopup: toPreorderPopup(api.preorder_popup),
  };
}

/** The dashboard's slides for a page; none when it has none or the API could not be read. */
export function heroSlidesFor(page: HeroPage, content: StorefrontContent | null): HeroSlide[] {
  return (content?.heroSlides ?? []).filter((slide) => slide.placement === page || slide.placement === "both");
}

export function promoLinesFor(page: HeroPage, content: StorefrontContent | null): T[] {
  return (content?.promoLines ?? [])
    .filter((line) => line.placement === page || line.placement === "both")
    .map((line) => line.text);
}

/** Same test as the shop's "sale" collection, so the offers tile never leads to a list with no offers in it. */
export function hasDiscountedProduct(products: Product[]): boolean {
  return products.some((product) => getDiscountPercent(product) !== null);
}
