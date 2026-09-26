"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { photo } from "../lib/photo";
import { useLang } from "../lib/i18n";
import { ScrollReveal, CardReveal } from "./Reveal";
import { useCatalog } from "../lib/catalog-context";

function CategoryTrack({
  trackRef,
  onScrollChange,
}: {
  trackRef: RefObject<HTMLDivElement | null>;
  onScrollChange: () => void;
}) {
  const { lang, n } = useLang();
  const searchParams = useSearchParams();
  const activeSlug = searchParams ? searchParams.get("category") : null;

  // Mouse users can drag the row sideways (touch and trackpads already scroll it natively).
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // The track can mount after the section (Suspense), so report its scroll position once it exists.
  useEffect(() => {
    onScrollChange();
  }, [onScrollChange]);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !trackRef.current) return;
    drag.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: trackRef.current.scrollLeft,
    };
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state.active || !trackRef.current) return;
    const dx = e.clientX - state.startX;
    if (!state.moved && Math.abs(dx) > 5) {
      state.moved = true;
      setIsDragging(true);
    }
    if (state.moved) trackRef.current.scrollLeft = state.startScroll - dx;
  };

  const endDrag = () => {
    drag.current.active = false;
    setIsDragging(false);
  };

  const { categories } = useCatalog();
  const categoriesWithCounts = categories.map((category) => ({
    ...category,
    imageFit: "cover" as const,
    imagePosition: "object-center",
  }));


  return (
    <div
      ref={trackRef}
      onScroll={onScrollChange}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      onPointerCancel={endDrag}
      // Stop the browser's native link/image drag ghost from hijacking the gesture.
      onDragStart={(e) => e.preventDefault()}
      // A drag that ends over a card must not count as a click on its link.
      onClickCapture={(e) => {
        if (drag.current.moved) {
          e.preventDefault();
          e.stopPropagation();
          drag.current.moved = false;
        }
      }}
      className={`scrollbar-none -mx-4 flex scroll-px-4 overflow-y-hidden overscroll-x-contain gap-3 overflow-x-auto px-4 pb-3 pt-2 sm:-mx-6 sm:scroll-px-6 sm:gap-3.5 sm:px-6 lg:-mx-8 lg:scroll-px-8 lg:gap-4 lg:px-8 ${
        isDragging ? "cursor-grabbing select-none" : "snap-x snap-mandatory scroll-smooth"
      }`}
    >
      {categoriesWithCounts.map((cat, idx) => {
        const isActive = Boolean(activeSlug && activeSlug === cat.slug);
        const countText =
          lang === "bn"
            ? `${n(cat.itemCount)} টি প্রোডাক্ট`
            : `${n(cat.itemCount)} ${cat.itemCount === 1 ? "Product" : "Products"}`;

        return (
          <CardReveal
            key={cat.id}
            delay={(idx % 6) * 0.08}
            className="flex w-[clamp(128px,calc((100vw-5.25rem)/2),170px)] shrink-0 snap-start sm:w-[190px] lg:w-[200px]"
          >
            <Link
              draggable={false}
              href={`/shop?category=${cat.slug}`}
              className={`py-4.5 group relative flex h-full w-full flex-col items-center justify-center rounded-xl border px-3 text-center transition-all duration-300 sm:rounded-2xl sm:px-3.5 sm:py-5 ${
                isActive
                  ? "border-gold-500 bg-gold-50/70 shadow-sm ring-1 ring-gold-400/30"
                  : "shadow-2xs border-ink-200/90 bg-white hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50/70 hover:shadow-md hover:shadow-gold-500/10"
              }`}
              aria-label={`${cat.name[lang] || cat.name.en} - ${countText}`}
            >
              {/* Circular Product Image (matches reference image.png) */}
              <div className="sm:h-22 sm:w-22 relative mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-ink-50 p-1.5 ring-1 ring-ink-200/80 transition-all duration-300 group-hover:scale-105 group-hover:ring-gold-300 lg:h-24 lg:w-24">
                <div className="relative h-full w-full overflow-hidden rounded-full">
                  <Image
                    draggable={false}
                    src={photo(cat.image)}
                    alt={cat.name[lang] || cat.name.en}
                    fill
                    sizes="(max-width: 640px) 80px, 96px"
                    className={`rounded-full object-cover transition-transform duration-500 ease-out group-hover:scale-110 ${cat.imagePosition || "object-center"}`}
                  />
                </div>
              </div>

              {/* Category Title */}
              <h3
                className={`text-sm font-bold tracking-tight transition-colors group-hover:text-gold-600 sm:text-[15px] ${isActive ? "text-gold-800" : "text-ink-900"}`}
              >
                {cat.name[lang] || cat.name.en}
              </h3>

              {/* Product Count (e.g. 28 Products) */}
              <p className="mt-0.5 text-[11px] font-medium text-ink-400 sm:text-xs">
                {countText}
              </p>
            </Link>
          </CardReveal>
        );
      })}
    </div>
  );
}

export function CategoryShowcase() {
  const { ui } = useLang();
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanScrollLeft(track.scrollLeft > 4);
    setCanScrollRight(track.scrollLeft + track.clientWidth < track.scrollWidth - 4);
  }, []);

  useEffect(() => {
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [updateScrollState]);

  const scrollTrack = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.8, behavior: "smooth" });
  };

  const arrowClass =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-ink-200 bg-white text-ink-700 shadow-2xs transition-colors hover:border-gold-500 hover:bg-gold-50 hover:text-gold-700 disabled:cursor-default disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:bg-white disabled:hover:text-ink-700";

  return (
    <section
      aria-label="Shop by Popular Categories"
      className="border-b border-ink-100 bg-white py-6 sm:py-7 lg:py-8"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal>
          <div className="mb-3 flex items-center justify-between gap-3 sm:mb-5">
            <h2 className="ts-display text-xl font-extrabold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
              {ui("categoriesTitle")}
            </h2>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => scrollTrack(-1)}
                disabled={!canScrollLeft}
                aria-label="Scroll categories left"
                className={arrowClass}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => scrollTrack(1)}
                disabled={!canScrollRight}
                aria-label="Scroll categories right"
                className={arrowClass}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        </ScrollReveal>

        {/* Horizontally scrollable category track: arrows, swipe on touch, drag or trackpad on desktop */}
        <Suspense fallback={<div className="h-48 w-full animate-pulse rounded-2xl bg-ink-100" />}>
          <CategoryTrack trackRef={trackRef} onScrollChange={updateScrollState} />
        </Suspense>
      </div>
    </section>
  );
}
