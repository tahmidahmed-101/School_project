"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { HERO_CTA_TEXT, HERO_SLIDES } from "../domain/hero-content";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { HeroCategoryRail } from "./HeroCategoryRail";
import { HeroWelcomePanel } from "./HeroWelcomePanel";

const AUTOPLAY_MS = 5000;

/** `shopLink` is where Shop Now goes (home: normal stock, pre-order page: pre-order stock). */
export function Hero({ shopLink = "/shop?type=normal", preorder = false }: { shopLink?: string; preorder?: boolean }) {
  const { lang } = useLang();
  const badge = preorder ? { en: "Pre Order", bn: "প্রি-অর্ডার" } : { en: "Stock", bn: "স্টক" };
  const [index, setIndex] = useState(0);
  // Slides mount one step ahead of the viewer so hidden banners don't compete with the LCP image on load.
  const [mounted, setMounted] = useState(1);
  const [rotated, setRotated] = useState(false);
  const slide = HERO_SLIDES[index];

  const go = useCallback((next: number) => {
    const target = (next + HERO_SLIDES.length) % HERO_SLIDES.length;
    setIndex(target);
    setRotated(true);
    setMounted((m) => Math.max(m, target + 1));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => go(index + 1), AUTOPLAY_MS);
    return () => clearTimeout(timer);
  }, [index, go]);

  return (
    <section
      aria-label="Hero"
      className="relative overflow-hidden bg-ink-50/70 pb-4 pt-2 sm:pb-5 sm:pt-3 lg:pb-6 lg:pt-4"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500/10 via-gold-400/10 to-brand-400/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5">
          {/* Left: shop-by-category rail (desktop only; mobile shows just the banner). Absolutely positioned so a long
              category list scrolls inside the rail instead of stretching the row past the banner's height. */}
          <ScrollReveal y={24} duration={0.85} className="relative hidden lg:order-1 lg:col-span-2 lg:block">
            <div className="absolute inset-0">
              <HeroCategoryRail preorder={preorder} />
            </div>
          </ScrollReveal>

          {/* Middle: banner slider (first slide is the LCP image, so no reveal animation) */}
          <div className="flex h-full flex-col lg:order-2 lg:col-span-8">
            <div className="relative flex h-full min-h-[220px] flex-1 flex-col justify-center overflow-hidden rounded-2xl shadow-lg sm:min-h-[280px] sm:rounded-[28px] lg:min-h-[360px]">
              {HERO_SLIDES.map((s, i) =>
                i > mounted ? null : (
                  <Image
                    key={s.image}
                    src={photo(s.image)}
                    alt={s.alt}
                    fill
                    priority={i === 0}
                    sizes="(max-width: 1024px) 100vw, 810px"
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
                  <span className="mb-2 inline-block rounded-full bg-gold-400 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-ink-950 sm:text-xs">
                    {badge[lang]}
                  </span>
                  <div className="flex items-start gap-1.5 text-[10px] font-bold uppercase leading-snug tracking-wider text-white/90 sm:items-center sm:text-xs">
                    <span className="sm:truncate">{slide.tag[lang]}</span>
                  </div>

                  <h1 className="ts-display mt-2 text-lg font-extrabold leading-tight tracking-tight text-white sm:mt-3 sm:text-2xl lg:text-[32px] xl:text-[38px]">
                    {slide.title[lang].split("\n").map((line, i) => (
                      <span key={i} className="block">
                        {line}
                      </span>
                    ))}
                  </h1>
                </div>

                <Link
                  href={shopLink}
                  className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-ink-950 shadow-md transition-all duration-200 hover:scale-[1.03] hover:bg-gold-400 hover:text-ink-950 active:scale-[0.98] sm:mt-6 sm:px-7 sm:py-3 sm:text-sm"
                >
                  <span>{HERO_CTA_TEXT[lang]}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </Link>
              </div>

              <div className="absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  aria-label="Previous slide"
                  className="hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/80 text-ink-900 shadow-md backdrop-blur-sm transition hover:bg-white sm:flex"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex gap-4">
                  {HERO_SLIDES.map((s, i) => (
                    <button
                      key={s.image}
                      type="button"
                      onClick={() => go(i)}
                      aria-label={`Go to slide ${i + 1}`}
                      aria-current={i === index}
                      className={`relative h-2 cursor-pointer rounded-full transition-all before:absolute before:-inset-2 before:content-[''] ${
                        i === index ? "w-6 bg-white" : "w-2 bg-white/50 hover:bg-white/80"
                      }`}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => go(index + 1)}
                  aria-label="Next slide"
                  className="hidden h-6 w-6 cursor-pointer items-center justify-center rounded-full bg-white/80 text-ink-900 shadow-md backdrop-blur-sm transition hover:bg-white sm:flex"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: welcome card + quick links (desktop only; mobile shows just the banner) */}
          <ScrollReveal y={24} duration={0.85} delay={0.1} className="hidden lg:order-3 lg:col-span-2 lg:block">
            <HeroWelcomePanel />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
