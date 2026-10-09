"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { HERO_CTA_TEXT, type HeroSlide } from "../domain/hero-content";
import { useLang } from "@/lib/i18n";
import { useCatalog } from "@/modules/catalog";
import { photo } from "@/lib/photo";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { HeroCategoryRail } from "./HeroCategoryRail";
import { HeroWelcomePanel } from "./HeroWelcomePanel";
import { containerClass } from "@/design-system/ui/Container";

const AUTOPLAY_MS = 5000;

/** `shopLink` is where Shop Now goes (home: normal stock, pre-order page: pre-order stock). */
export function Hero({
  heading,
  slides,
  hasOffers,
  shopLink = "/shop?type=normal",
  preorder = false,
}: {
  /** The page's H1; slide titles rotate every few seconds, so they can't be it. */
  heading: string;
  /** Empty until staff add a slide for this page; the banner then shows only its shop button. */
  slides: HeroSlide[];
  hasOffers: boolean;
  shopLink?: string;
  preorder?: boolean;
}) {
  const { lang, ui, n } = useLang();
  const { categories } = useCatalog();
  const hasRail = categories.some((category) => category.type === (preorder ? "preorder" : "stock"));
  const badge = preorder ? { en: "Pre-order", bn: "প্রি-অর্ডার" } : { en: "Stock", bn: "স্টক" };
  const [index, setIndex] = useState(0);
  // Slides mount one step ahead of the viewer so hidden banners don't compete with the LCP image on load.
  const [mounted, setMounted] = useState(1);
  const [rotated, setRotated] = useState(false);
  const count = slides.length;
  const slide = slides[index] ?? slides[0];
  const tag = slide?.tag[lang];
  const title = slide?.title[lang];

  const go = useCallback(
    (next: number) => {
      if (count === 0) return;
      const target = (next + count) % count;
      setIndex(target);
      setRotated(true);
      setMounted((m) => Math.max(m, target + 1));
    },
    [count],
  );

  useEffect(() => {
    if (count < 2) return;
    const timer = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, go, count]);

  return (
    <section
      aria-label={ui("heroCarousel")}
      className="relative overflow-hidden bg-ink-50/70 pb-4 pt-2 sm:pb-5 sm:pt-3 lg:pb-6 lg:pt-4"
    >
      <h1 className="sr-only">{heading}</h1>
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500/10 via-gold-400/10 to-brand-400/10 blur-[100px]" />

      <div className={containerClass("default", "relative z-10")}>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5">
          {/* Left: shop-by-category rail (desktop only; mobile shows just the banner). Absolutely positioned so a long
              category list scrolls inside the rail instead of stretching the row past the banner's height. */}
          {hasRail && (
            <ScrollReveal y={24} duration={0.85} className="relative hidden lg:order-1 lg:col-span-3 lg:block">
              <div className="absolute inset-0">
                <HeroCategoryRail preorder={preorder} />
              </div>
            </ScrollReveal>
          )}

          {/* Middle: banner slider (first slide is the LCP image, so no reveal animation) */}
          <div className={`flex h-full flex-col lg:order-2 ${hasRail ? "lg:col-span-6" : "lg:col-span-9"}`}>
            <div className="relative flex h-full min-h-[220px] flex-1 flex-col justify-center overflow-hidden rounded-2xl bg-ink-950 shadow-lg sm:min-h-[280px] sm:rounded-3xl lg:min-h-[360px]">
              {slides.map((s, i) =>
                i > mounted ? null : (
                  <Image
                    key={s.id}
                    src={photo(s.image)}
                    alt={s.alt}
                    fill
                    preload={i === 0}
                    fetchPriority={i === 0 ? "high" : undefined}
                    sizes="(max-width: 1024px) 100vw, 620px"
                    aria-hidden={i !== index}
                    className={`object-cover transition-opacity duration-700 ease-in-out ${
                      i === index ? "opacity-100" : "opacity-0"
                    }`}
                  />
                ),
              )}
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, rgba(12,21,11,0.85) 0%, rgba(12,21,11,0.55) 38%, rgba(12,21,11,0.05) 68%, rgba(12,21,11,0) 100%)",
                }}
              />

              <div className="relative z-20 max-w-[75%] p-5 sm:max-w-[55%] sm:p-7 lg:max-w-[420px] lg:p-9">
                <div key={index} className={rotated ? "animate-[hero-caption_0.4s_ease-out]" : undefined}>
                  <span className="mb-2 inline-block rounded-full bg-gold-400 px-2.5 py-0.5 text-2xs font-extrabold uppercase tracking-wider text-ink-950 sm:text-xs">
                    {badge[lang]}
                  </span>
                  {tag && (
                    <div className="flex items-start gap-1.5 text-2xs font-bold uppercase leading-snug tracking-wider text-white/90 sm:items-center sm:text-xs">
                      <span className="sm:truncate">{tag}</span>
                    </div>
                  )}

                  {title && (
                    <p className="ts-display mt-2 text-lg font-extrabold leading-tight tracking-tight text-white sm:mt-3 sm:text-2xl lg:text-3xl xl:text-4xl">
                      {title.split("\n").map((line, i) => (
                        <span key={i} className="block">
                          {line}
                        </span>
                      ))}
                    </p>
                  )}
                </div>

                <Link
                  href={slide?.linkUrl || shopLink}
                  className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-canvas px-4 py-2 text-xs font-bold text-ink-950 shadow-md transition-all duration-200 hover:scale-[1.03] hover:bg-accent-hover hover:text-ink-950 active:scale-[0.98] sm:mt-6 sm:px-7 sm:py-3 sm:text-sm"
                >
                  <span>{HERO_CTA_TEXT[lang]}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </Link>
              </div>

              <div
                className={`absolute bottom-3 left-1/2 z-30 -translate-x-1/2 items-center gap-2.5 ${count > 1 ? "flex" : "hidden"}`}
              >
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  aria-label={ui("previousSlide")}
                  className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/80 text-fg shadow-md backdrop-blur-sm transition hover:bg-canvas sm:flex"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-4">
                  {slides.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`${ui("slide")} ${n(i + 1)}`}
                      aria-current={i === index}
                      className={`relative h-2 cursor-pointer rounded-full transition-all before:absolute before:-inset-2 before:content-[''] ${
                        i === index ? "w-6 bg-canvas" : "w-2 bg-white/50 hover:bg-white/80"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  aria-label={ui("nextSlide")}
                  className="hidden h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/80 text-fg shadow-md backdrop-blur-sm transition hover:bg-canvas sm:flex"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: welcome card + quick links (desktop only; mobile shows just the banner) */}
          <ScrollReveal y={24} duration={0.85} delay={0.1} className="hidden lg:order-3 lg:col-span-3 lg:block">
            <HeroWelcomePanel hasOffers={hasOffers} kind={preorder ? "preorder" : "stock"} />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
