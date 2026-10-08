import type { T } from "@/lib/types";

export interface HeroSlide {
  id: string;
  image: string;
  alt: string;
  tag: T;
  /** Lines are separated by "\n". */
  title: T;
  /** Where the slide's button goes; the page's own shop link when unset. */
  linkUrl?: string;
}

export const HERO_CTA_TEXT: T = { en: "Shop now", bn: "কিনুন" };
