"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Zap } from "lucide-react";
import { HERO_SLIDES, HERO_PROMOS } from "../lib/hero-slides";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";
import { ScrollReveal } from "./Reveal";
import { HeroPromoCard } from "./HeroPromoCard";

const SLIDE_INTERVAL_MS = 6000;

export function Hero() {
  const { lang } = useLang();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-advance unless the pointer is over the carousel
  useEffect(() => {
    if (isPaused) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % HERO_SLIDES.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isPaused]);

  const slide = HERO_SLIDES[currentSlide] ?? HERO_SLIDES[0]!;

  return (
    <section
      aria-label="Multi-Category Hero Showcase"
      className="relative overflow-hidden bg-ink-50/70 pb-6 pt-3 sm:pb-8 sm:pt-5 lg:pb-10 lg:pt-6"
    >
      <div className="pointer-events-none absolute -top-24 left-1/2 h-80 w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-r from-brand-500/10 via-gold-400/10 to-brand-400/10 blur-[100px]" />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-3 sm:gap-5 lg:grid-cols-12 lg:gap-6">
          {/* Main carousel */}
          <ScrollReveal y={28} duration={0.9} className="flex h-full flex-col lg:col-span-8">
            <div
              onMouseEnter={() => setIsPaused(true)}
              onMouseLeave={() => setIsPaused(false)}
              className="group relative flex h-full min-h-[300px] flex-1 flex-col justify-between overflow-hidden rounded-2xl p-5 shadow-lg transition-all duration-700 sm:min-h-[380px] sm:rounded-[28px] sm:p-8 lg:min-h-[520px] lg:p-11"
              style={{ backgroundImage: slide.gradient }}
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent opacity-80" />

              <div className="relative z-20 max-w-[54%] sm:max-w-[50%] lg:max-w-[450px] xl:max-w-[500px]">
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={slide.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="inline-flex items-start gap-1.5 text-[10px] font-bold uppercase leading-snug tracking-wider text-white/90 sm:items-center sm:text-xs">
                      <Zap className="hidden h-3.5 w-3.5 shrink-0 fill-gold-400 text-gold-400 sm:block" />
                      <span className="sm:truncate">{slide.tag[lang]}</span>
                    </div>

                    <h1 className="ts-display mt-2 text-lg font-extrabold leading-tight tracking-tight text-white sm:mt-3 sm:text-3xl lg:text-[46px] xl:text-[52px]">
                      {slide.title[lang].split("\n").map((line, i) => (
                        <span key={i} className="block">
                          {line}
                        </span>
                      ))}
                    </h1>
                  </motion.div>
                </AnimatePresence>
              </div>

              <div className="relative z-20 mt-4 flex flex-col items-start gap-3 sm:mt-8 sm:flex-row sm:items-center sm:gap-6">
                <Link
                  href={slide.ctaLink}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-ink-950 shadow-md transition-all duration-200 hover:scale-[1.03] hover:bg-gold-400 hover:text-ink-950 active:scale-[0.98] sm:px-7 sm:py-3 sm:text-sm"
                >
                  <span>{slide.ctaText[lang]}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 sm:h-4 sm:w-4" />
                </Link>

                <div
                  className="flex items-center gap-1.5 sm:gap-2.5"
                  role="tablist"
                  aria-label="Hero slider pagination"
                >
                  {HERO_SLIDES.map((s, idx) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setCurrentSlide(idx)}
                      aria-label={`Go to slide ${idx + 1}`}
                      className={`h-1.5 cursor-pointer rounded-full transition-all duration-300 sm:h-2 ${
                        currentSlide === idx
                          ? "w-6 bg-white shadow-sm sm:w-8"
                          : "w-3 bg-white/35 hover:bg-white/70 sm:w-5"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Photo panel: right-edge on mobile (like the promo cards), corner-anchored on sm+ */}
              <div className="pointer-events-none absolute bottom-0 right-0 top-4 z-10 w-[42%] overflow-hidden rounded-br-2xl rounded-tl-xl sm:top-auto sm:h-[55%] sm:w-[46%] sm:rounded-br-[28px] sm:rounded-tl-2xl lg:h-[54%] lg:w-[48%]">
                <AnimatePresence initial={false} mode="wait">
                  <motion.div
                    key={slide.id}
                    initial={{ opacity: 0, scale: 0.96 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.02 }}
                    transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    className="relative h-full w-full"
                  >
                    <Image
                      src={photo(slide.image)}
                      alt={slide.imageAlt}
                      fill
                      priority
                      sizes="(max-width: 640px) 42vw, (max-width: 1024px) 46vw, 500px"
                      className="object-cover object-center"
                    />
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </ScrollReveal>

          {/* Promo cards: 2-up on mobile, stacked beside the carousel on desktop */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:col-span-4 lg:flex lg:flex-col lg:gap-6">
            {HERO_PROMOS.map((promo, idx) => (
              <ScrollReveal
                key={promo.id}
                y={24}
                duration={0.85}
                delay={0.1 * (idx + 1)}
                className="flex flex-1 flex-col"
              >
                <HeroPromoCard promo={promo} />
              </ScrollReveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
