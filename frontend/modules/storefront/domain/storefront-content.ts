import type { ApiHeroSlide, ApiPreorderPopup, ApiPromotionPopup, ApiStorefrontContent } from "@/lib/api/types";
import { toNumber } from "@/lib/api/parse";
import type { Product, T } from "@/lib/types";
import { getDiscountPercent } from "@/lib/product";
import { normalizeImageUrl } from "@/lib/photo";
import type { HeroSlide } from "./hero-content";

export type HeroPage = "home" | "preorder";

export interface ManagedHeroSlide extends HeroSlide {
  placement: ApiHeroSlide["placement"];
}

export interface PromotionCard {
  id: string;
  name: string;
  slug: string;
  image?: string;
  /** What the shopper pays now: the sale price, or a pre-order's current price. */
  price: number;
  /** The list price, when it is higher than `price`. */
  originalPrice?: number;
  /** Set on a sale card. */
  percentOff?: number;
  /** ISO date a pre-order is expected to arrive. */
  releaseDate?: string;
}

/** A dashboard popup as the backend chose and priced it: the shop one carries its sale, the pre-order one none. */
export interface PromotionPopup {
  id: string;
  image?: string;
  title: T;
  body: T;
  cta?: { label: T; url: string };
  sale?: { name: string; percentOff: number; endsAt?: string };
  products: PromotionCard[];
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

/** The content every popup shares, or null when it has no title. An unsafe button link is dropped. */
function toPopupContent(api: ApiPromotionPopup | ApiPreorderPopup, products: PromotionCard[]): PromotionPopup | null {
  const title = localized(api.title);
  if (!title.en) return null;
  const ctaUrl = safeLink(api.cta?.url);
  const ctaLabel = localized(api.cta?.label);
  return {
    id: api.id,
    image: api.image || undefined,
    title,
    body: localized(api.body),
    cta: ctaUrl && ctaLabel.en ? { label: ctaLabel, url: ctaUrl } : undefined,
    products,
  };
}

/**
 * The shop popup the backend chose, or null. Products are optional: a popup may only announce its sale. Cards that are
 * not actually discounted are left out.
 */
export function toPromotionPopup(api: ApiPromotionPopup | null | undefined): PromotionPopup | null {
  if (!api) return null;
  const products = (api.products ?? [])
    .map((card) => ({
      id: card.id,
      name: card.name,
      slug: card.slug,
      image: card.image ? normalizeImageUrl(card.image) : undefined,
      price: toNumber(card.price),
      originalPrice: toNumber(card.original_price),
      percentOff: toNumber(card.percent_off),
    }))
    .filter((card) => card.slug && card.price > 0 && card.price < card.originalPrice);
  const popup = toPopupContent(api, products);
  if (!popup) return null;
  return {
    ...popup,
    sale: {
      name: api.sale?.name ?? "",
      percentOff: toNumber(api.sale?.percent_off ?? "0"),
      endsAt: api.sale?.ends_at ?? undefined,
    },
  };
}

/** The pre-order page popup the backend chose, or null. It has no sale; a card shows a list price only when higher. */
export function toPreorderPopup(api: ApiPreorderPopup | null | undefined): PromotionPopup | null {
  if (!api) return null;
  const products = (api.products ?? [])
    .map((card) => {
      const price = toNumber(card.price);
      const original = card.original_price ? toNumber(card.original_price) : undefined;
      return {
        id: card.id,
        name: card.name,
        slug: card.slug,
        image: card.image ? normalizeImageUrl(card.image) : undefined,
        price,
        originalPrice: original !== undefined && original > price ? original : undefined,
        releaseDate: card.release_date ?? undefined,
      };
    })
    .filter((card) => card.slug && card.price > 0);
  return toPopupContent(api, products);
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
