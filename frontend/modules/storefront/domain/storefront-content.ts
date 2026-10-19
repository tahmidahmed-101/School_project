import type { ApiHeroSlide, ApiPromotionPopup, ApiStorefrontContent } from "@/lib/api/types";
import { toNumber } from "@/lib/api/parse";
import type { Product, T } from "@/lib/types";
import { getDiscountPercent } from "@/lib/product";
import type { HeroSlide } from "./hero-content";

export type HeroPage = "home" | "preorder";

export interface ManagedHeroSlide extends HeroSlide {
  placement: ApiHeroSlide["placement"];
}

/** The shop a popup belongs to; it shows on that shop's pages. */
export type PopupShop = ApiPromotionPopup["shop"];

/** A dashboard popup campaign: one image, where clicking it goes (null: nowhere), and when it may show. */
export interface PromotionPopup {
  id: string;
  image: string;
  href: string | null;
  shop: PopupShop;
  /** Epoch ms; null means open-ended. */
  startsAt: number | null;
  endsAt: number | null;
  sale?: { name: string; percentOff: number };
}

/** Hero slides, promo lines and the popup campaigns, as published in the dashboard. */
export interface StorefrontContent {
  heroSlides: ManagedHeroSlide[];
  promoLines: { text: T; placement: ApiHeroSlide["placement"] }[];
  /** Highest priority first. */
  promotionPopups: PromotionPopup[];
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

function toTime(value: string | null | undefined): number | null {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : time;
}

/**
 * The popup, or null without an image or with an unsafe link, so it can never become a script link.
 * A popup with no destination (null href) is kept: it shows the image without a link.
 */
export function toPromotionPopup(api: ApiPromotionPopup): PromotionPopup | null {
  const href = api.href ? safeLink(api.href) : null;
  if (!api.image || href === undefined) return null;
  return {
    id: api.id,
    image: api.image,
    href,
    shop: api.shop === "preorder" ? "preorder" : "stock",
    startsAt: toTime(api.starts_at),
    endsAt: toTime(api.ends_at),
    ...(api.sale ? { sale: { name: api.sale.name, percentOff: toNumber(api.sale.percent_off) } } : {}),
  };
}

/**
 * The popup to show on a page of `shop`: the first (highest priority) one of that shop that is inside its schedule at `now`. The API already filters by schedule, but its answer is cached, so the times are checked again here.
 */
export function pickPromotionPopup(popups: PromotionPopup[], shop: PopupShop, now: number): PromotionPopup | null {
  return (
    popups.find(
      (popup) =>
        popup.shop === shop &&
        (popup.startsAt === null || popup.startsAt <= now) &&
        (popup.endsAt === null || now < popup.endsAt),
    ) ?? null
  );
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
    promotionPopups: (api.promotion_popups ?? [])
      .map(toPromotionPopup)
      .filter((popup): popup is PromotionPopup => popup !== null),
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
