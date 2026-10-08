"use client";

import { useLang } from "@/lib/i18n";
import type { T } from "@/lib/types";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { containerClass } from "@/design-system/ui/Container";

/** Continuously scrolling (right to left) promo strip shown right below the hero on the home and pre-order pages. */
export function PromoMarquee({ lines }: { lines: T[] }) {
  const { lang } = useLang();

  const track = (
    <div className="flex shrink-0 items-center" aria-hidden="true">
      {lines.map((item, i) => (
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
    <ScrollReveal y={16} duration={0.7} className={containerClass("default", "pb-3 pt-1 sm:pb-4 sm:pt-1.5")}>
      <div className="overflow-hidden rounded border border-gold-600/40 bg-gold-400 py-2 sm:rounded-md">
        <div className="sr-only">{lines.map((item) => item[lang]).join(" — ")}</div>
        <div className="flex w-max animate-marquee-rtl hover:[animation-play-state:paused]">
          {track}
          {track}
        </div>
      </div>
    </ScrollReveal>
  );
}
