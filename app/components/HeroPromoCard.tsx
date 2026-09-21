"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { HeroPromo } from "../lib/hero-slides";
import { useLang } from "../lib/i18n";
import { photo } from "../lib/photo";

/** Compact category promo shown beside the main hero carousel. */
export function HeroPromoCard({ promo }: { promo: HeroPromo }) {
  const { lang } = useLang();

  return (
    <div
      className={`group relative flex h-full min-h-[145px] flex-1 flex-col justify-between overflow-hidden rounded-2xl bg-gradient-to-br ${promo.gradientClass} p-3.5 shadow-md transition-all duration-300 hover:shadow-xl sm:min-h-[190px] sm:rounded-[24px] sm:p-5 lg:min-h-[240px] lg:rounded-[28px] lg:p-7`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_var(--tw-gradient-stops))] from-white/15 via-transparent to-transparent opacity-80" />

      <div className="relative z-20 max-w-[58%] sm:max-w-[54%]">
        <span className="text-[9px] font-bold uppercase tracking-wider text-white/80 sm:text-[11px] sm:tracking-widest">
          {promo.eyebrow[lang]}
        </span>
        <h2 className="ts-display mt-1 text-sm font-extrabold leading-tight text-white sm:mt-2 sm:text-xl lg:text-[26px]">
          {promo.title[lang].split("\n").map((line, i) => (
            <span key={i} className="block">
              {line}
            </span>
          ))}
        </h2>
      </div>

      <div className="relative z-20 mt-2 sm:mt-4">
        <Link
          href={promo.href}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-white underline decoration-white/70 underline-offset-2 transition-all hover:text-gold-300 hover:decoration-gold-300 sm:text-xs lg:text-sm"
        >
          <span>{lang === "bn" ? "দেখুন" : "Shop Now"}</span>
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5 sm:h-3.5 sm:w-3.5" />
        </Link>
      </div>

      <div className="pointer-events-none absolute bottom-0 right-0 top-3 w-[45%] overflow-hidden rounded-br-2xl rounded-tl-xl sm:top-5 sm:w-[42%] sm:rounded-br-[24px] sm:rounded-tl-2xl lg:rounded-br-[28px]">
        <div className="relative h-full w-full">
          <Image
            src={photo(promo.image)}
            alt={promo.imageAlt}
            fill
            sizes="(max-width: 640px) 35vw, 260px"
            className="object-cover object-top transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </div>
    </div>
  );
}
