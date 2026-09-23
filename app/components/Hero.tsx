"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HERO_BANNER } from "../lib/hero-content";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";
import { ScrollReveal } from "./Reveal";
import { HeroCategoryRail } from "./HeroCategoryRail";
import { HeroWelcomePanel } from "./HeroWelcomePanel";

export function Hero() {
  const { lang } = useLang();

  return (
    <section
      aria-label="Hero"
      className="relative overflow-hidden bg-ink-50/70 pb-4 pt-2 sm:pb-5 sm:pt-3 lg:pb-6 lg:pt-4"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500/10 via-gold-400/10 to-brand-400/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5">
          {/* Left: shop-by-category rail (desktop only; mobile shows just the banner) */}
          <ScrollReveal y={24} duration={0.85} className="hidden lg:order-1 lg:col-span-2 lg:block">
            <HeroCategoryRail />
          </ScrollReveal>

          {/* Middle: big banner (no reveal animation — it's the LCP content, shown immediately) */}
          <div className="flex h-full flex-col lg:order-2 lg:col-span-8">
            <div className="relative flex h-full min-h-[220px] flex-1 flex-col justify-center overflow-hidden rounded-2xl shadow-lg sm:min-h-[280px] sm:rounded-[28px] lg:min-h-[360px]">
              <Image
                src={photo("brand/hero-banner.png")}
                alt="Kull Mart hero banner: phones, earbuds, laptop, headphones and everyday accessories"
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 810px"
                className="object-cover"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, rgba(12,21,11,0.85) 0%, rgba(12,21,11,0.55) 38%, rgba(12,21,11,0.05) 68%, rgba(12,21,11,0) 100%)",
                }}
              />

              <ScrollReveal
                y={18}
                duration={0.8}
                className="relative z-20 max-w-[75%] p-5 sm:max-w-[55%] sm:p-7 lg:max-w-[420px] lg:p-9"
              >
                <div className="inline-flex items-start gap-1.5 text-[10px] font-bold uppercase leading-snug tracking-wider text-white/90 sm:items-center sm:text-xs">
                  <span className="sm:truncate">{HERO_BANNER.tag[lang]}</span>
                </div>

                <h1 className="ts-display mt-2 text-lg font-extrabold leading-tight tracking-tight text-white sm:mt-3 sm:text-2xl lg:text-[32px] xl:text-[38px]">
                  {HERO_BANNER.title[lang].split("\n").map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </h1>

                <Link
                  href={HERO_BANNER.ctaLink}
                  className="group mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-ink-950 shadow-md transition-all duration-200 hover:scale-[1.03] hover:bg-gold-400 hover:text-ink-950 active:scale-[0.98] sm:mt-6 sm:px-7 sm:py-3 sm:text-sm"
                >
                  <span>{HERO_BANNER.ctaText[lang]}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </Link>
              </ScrollReveal>
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
