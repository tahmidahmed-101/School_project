"use client";

import { useLang } from "../lib/i18n";
import type { T } from "../lib/types";
import { ScrollReveal } from "./Reveal";

const MARQUEE_ITEMS: T[] = [
  {
    en: "Cash on delivery available nationwide",
    bn: "সারাদেশে ক্যাশ অন ডেলিভারি সুবিধা",
  },
  {
    en: "Free delivery on orders over ৳2,000",
    bn: "৳২,০০০ এর বেশি অর্ডারে ফ্রি ডেলিভারি",
  },
  {
    en: "Wholesale & retail orders welcome",
    bn: "পাইকারি ও খুচরা উভয় অর্ডার গ্রহণযোগ্য",
  },
  {
    en: "Women's fashion, innerwear, kids & gadgets",
    bn: "নারীদের ফ্যাশন, ইনারওয়্যার, কিডস ও গ্যাজেটস",
  },
  {
    en: "New arrivals added every week",
    bn: "প্রতি সপ্তাহে নতুন পণ্য যুক্ত হয়",
  },
];

/** Continuously scrolling promo strip shown right below the hero. */
export function PromoMarquee() {
  const { lang } = useLang();

  const track = (
    <div className="flex shrink-0 items-center" aria-hidden="true">
      {MARQUEE_ITEMS.map((item, i) => (
        <span key={i} className="flex items-center gap-6 px-6">
          <span className="whitespace-nowrap text-xs font-bold uppercase tracking-wider text-ink-950 sm:text-sm">
            {item[lang]}
          </span>
          <span className="h-1 w-1 shrink-0 rounded-full bg-ink-950/40" />
        </span>
      ))}
    </div>
  );

  return (
    <ScrollReveal
      y={16}
      duration={0.7}
      className="mx-auto max-w-7xl px-4 pb-3 pt-1 sm:px-6 sm:pb-4 sm:pt-1.5 lg:px-8"
    >
      <div className="overflow-hidden rounded border border-gold-600/40 bg-gold-400 py-2 sm:rounded-md">
        <div className="sr-only">{MARQUEE_ITEMS.map((item) => item[lang]).join(" — ")}</div>
        <div className="flex w-max animate-marquee-ltr hover:[animation-play-state:paused]">
          {track}
          {track}
        </div>
      </div>
    </ScrollReveal>
  );
}
