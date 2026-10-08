"use client";

import { Suspense, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { photo } from "@/lib/photo";
import { useLang } from "@/lib/i18n";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { useCatalog } from "../context";

/** Auto-slide speed, in pixels per second. */
const SLIDE_SPEED = 40;
/** How long the row stays still after the visitor lets go of it. */
const RESUME_DELAY_MS = 1500;

type ScrollByPage = (direction: 1 | -1) => void;

interface CategoryTrackProps {
  scrollByPageRef: RefObject<ScrollByPage | null>;
  preorder: boolean;
  /** True when every category fits in the row at once, so there is nothing to slide or loop. */
  isStatic: boolean;
  onStaticChange: (isStatic: boolean) => void;
}

function CategoryTrack({ scrollByPageRef, preorder, isStatic, onStaticChange }: CategoryTrackProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { lang, n } = useLang();
  const searchParams = useSearchParams();
  const activeSlug = searchParams ? searchParams.get("category") : null;

  // Mouse users can drag the row sideways (touch and trackpads already scroll it natively).
  const drag = useRef({ active: false, moved: false, startX: 0, startScroll: 0 });
  const [isDragging, setIsDragging] = useState(false);

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
    if (drag.current.active) holdFor(RESUME_DELAY_MS);
    drag.current.active = false;
    setIsDragging(false);
  };

  const { categories: allCategories } = useCatalog();
  // Stock and pre-order are separate catalogues: the home page lists one, the pre-order page the other.
  const categories = allCategories.filter((category) => category.type === (preorder ? "preorder" : "stock"));
  const count = categories.length;

  // The list is rendered several times in a row and the scroll position wraps by one list width,
  // so the row never reaches an end. Enough copies that a wrap, or an arrow press, always has room.
  const [copies, setCopies] = useState(2);
  // What is holding the auto-slide still: the pointer, keyboard focus, a finger, or a recent action.
  const hold = useRef({ hovered: false, focused: false, touching: false, until: 0 });

  /** Width of one copy of the list, gap included. */
  const loopWidth = () => {
    const track = trackRef.current;
    const first = track?.children[0] as HTMLElement | undefined;
    const repeat = track?.children[count] as HTMLElement | undefined;
    return first && repeat ? repeat.offsetLeft - first.offsetLeft : 0;
  };
  const loopWidthRef = useRef(loopWidth);
  useEffect(() => {
    loopWidthRef.current = loopWidth;
  });

  useEffect(() => {
    const track = trackRef.current;
    if (!track || count === 0) return;
    const observer = new ResizeObserver(() => {
      const first = track.children[0] as HTMLElement | undefined;
      const second = track.children[1] as HTMLElement | undefined;
      // Measured from one card, so it also works while only a single copy is rendered.
      const width = first && second ? (second.offsetLeft - first.offsetLeft) * count : 0;
      if (width <= 0) return;
      const fits = width <= track.clientWidth;
      onStaticChange(fits);
      if (!fits) setCopies(Math.max(2, Math.ceil((2 * track.clientWidth) / width) + 1));
    });
    observer.observe(track);
    return () => observer.disconnect();
  }, [trackRef, count, onStaticChange]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || count === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let visible = true;
    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    observer.observe(track);

    let frame = 0;
    let last = 0;
    // scrollLeft is rounded by some browsers, so the exact position is kept here.
    let position = track.scrollLeft;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const elapsed = Math.min(now - last, 100);
      last = now;
      const held = hold.current;
      const width = loopWidthRef.current();
      if (
        !visible ||
        width <= 0 ||
        drag.current.active ||
        held.hovered ||
        held.focused ||
        held.touching ||
        now < held.until
      ) {
        return;
      }
      // Pick up from wherever the visitor left the row.
      if (Math.abs(track.scrollLeft - position) > 1) position = track.scrollLeft;
      position = (position + (SLIDE_SPEED * elapsed) / 1000) % width;
      track.scrollLeft = position;
    };
    frame = requestAnimationFrame((now) => {
      last = now;
      tick(now);
    });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [trackRef, count]);

  const holdFor = (ms: number) => {
    hold.current.until = performance.now() + ms;
  };

  useEffect(() => {
    scrollByPageRef.current = (direction) => {
      const track = trackRef.current;
      if (!track) return;
      const width = loopWidthRef.current();
      const step = track.clientWidth * 0.8;
      // The copies are identical, so jumping one list width is invisible; it makes room to go back.
      if (direction === -1 && track.scrollLeft < step) track.scrollLeft += width;
      if (direction === 1 && track.scrollLeft >= width) track.scrollLeft -= width;
      hold.current.until = performance.now() + RESUME_DELAY_MS;
      track.scrollBy({ left: direction * step, behavior: "smooth" });
    };
    return () => {
      scrollByPageRef.current = null;
    };
  }, [scrollByPageRef, trackRef]);

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") hold.current.hovered = true;
      }}
      onPointerLeave={() => {
        hold.current.hovered = false;
        endDrag();
      }}
      onPointerCancel={endDrag}
      onFocus={() => {
        hold.current.focused = true;
      }}
      onBlur={() => {
        hold.current.focused = false;
      }}
      onTouchStart={() => {
        hold.current.touching = true;
      }}
      onTouchEnd={() => {
        hold.current.touching = false;
        // A flick keeps gliding after the finger lifts.
        holdFor(RESUME_DELAY_MS);
      }}
      onTouchCancel={() => {
        hold.current.touching = false;
      }}
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
      // No scroll snapping or smooth scrolling here: both would fight the frame-by-frame slide.
      className={`scrollbar-none -mx-4 flex gap-3 overflow-y-hidden overflow-x-auto overscroll-x-contain px-4 pb-3 pt-2 sm:-mx-6 sm:gap-3.5 sm:px-6 lg:mx-0 lg:gap-4 lg:px-0 ${
        isStatic ? "" : "lg:[mask-image:linear-gradient(to_right,transparent,#000_4%,#000_96%,transparent)]"
      } ${isDragging ? "cursor-grabbing select-none" : ""}`}
    >
      {Array.from({ length: isStatic ? 1 : copies }, (_, copy) => categories.map((cat) => ({ cat, copy })))
        .flat()
        .map(({ cat, copy }) => {
          // Only the first copy is announced and reachable by keyboard; the rest are visual repeats.
          const isRepeat = copy > 0;
          const isActive = Boolean(activeSlug && activeSlug === cat.slug);
          const countText =
            lang === "bn"
              ? `${n(cat.itemCount)} টি প্রোডাক্ট`
              : `${n(cat.itemCount)} ${cat.itemCount === 1 ? "Product" : "Products"}`;

          return (
            <div
              key={`${copy}-${cat.id}`}
              aria-hidden={isRepeat || undefined}
              className="flex w-[clamp(128px,calc((100vw-5.25rem)/2),170px)] shrink-0 sm:w-[190px] lg:w-[200px]"
            >
              <Link
                draggable={false}
                tabIndex={isRepeat ? -1 : undefined}
                href={preorder ? `/shop?category=${cat.slug}&type=preorder` : `/shop?category=${cat.slug}`}
                prefetch={false}
                className={`py-4.5 group relative flex h-full w-full flex-col items-center justify-center rounded-xl border px-3 text-center transition-all duration-300 sm:rounded-2xl sm:px-3.5 sm:py-5 ${
                  isActive
                    ? "border-gold-500 bg-gold-50/70 shadow-sm ring-1 ring-gold-400/30"
                    : "shadow-2xs border-ink-200/90 bg-canvas hover:-translate-y-0.5 hover:border-gold-500 hover:bg-gold-50/70 hover:shadow-md hover:shadow-gold-500/10"
                }`}
                aria-label={`${cat.name[lang] || cat.name.en} - ${countText}`}
              >
                {/* Circular Product Image (matches reference image.png) */}
                <div className="sm:h-22 sm:w-22 relative mx-auto mb-3 flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-surface p-1.5 ring-1 ring-ink-200/80 transition-all duration-300 group-hover:scale-105 group-hover:ring-gold-300 lg:h-24 lg:w-24">
                  <div className="relative h-full w-full overflow-hidden rounded-full">
                    <Image
                      draggable={false}
                      src={photo(cat.image)}
                      alt={cat.name[lang] || cat.name.en}
                      fill
                      sizes="(max-width: 640px) 80px, 96px"
                      className="rounded-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-110"
                    />
                  </div>
                </div>

                {/* Category Title */}
                <h3
                  className={`text-sm font-bold tracking-tight transition-colors group-hover:text-gold-800 ${isActive ? "text-gold-800" : "text-fg"}`}
                >
                  {cat.name[lang] || cat.name.en}
                </h3>

                {/* Product Count (e.g. 28 Products) */}
                <p className="mt-0.5 text-2xs font-medium text-fg-muted sm:text-xs">{countText}</p>
              </Link>
            </div>
          );
        })}
    </div>
  );
}

/** "Browse by category" row. Lists the regular stock categories, or the pre-order ones with `preorder`. */
export function CategoryShowcase({ preorder = false }: { preorder?: boolean }) {
  const { ui } = useLang();
  const [isStatic, setIsStatic] = useState(false);
  const scrollByPageRef = useRef<ScrollByPage | null>(null);
  const scrollTrack = (direction: 1 | -1) => scrollByPageRef.current?.(direction);

  const arrowClass =
    "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-ink-200 bg-canvas text-ink-700 shadow-2xs transition-colors hover:border-gold-500 hover:bg-gold-50 hover:text-gold-700";

  return (
    <section aria-label={ui("categoriesTitle")} className="border-b border-ink-100 bg-canvas py-6 sm:py-7 lg:py-8">
      <Container>
        <ScrollReveal>
          <SectionHeading
            className="mb-3 sm:mb-5"
            title={ui("categoriesTitle")}
            action={
              <div className={`flex items-center gap-2 ${isStatic ? "hidden" : ""}`}>
                <button
                  type="button"
                  onClick={() => scrollTrack(-1)}
                  aria-label={ui("scrollCategoriesLeft")}
                  className={arrowClass}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollTrack(1)}
                  aria-label={ui("scrollCategoriesRight")}
                  className={arrowClass}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            }
          />
        </ScrollReveal>

        {/* Category track: slides on its own in a loop; arrows, swipe, drag or trackpad still move it */}
        <ScrollReveal>
          <Suspense fallback={<div className="h-48 w-full animate-pulse rounded-2xl bg-surface-muted" />}>
            <CategoryTrack
              scrollByPageRef={scrollByPageRef}
              preorder={preorder}
              isStatic={isStatic}
              onStaticChange={setIsStatic}
            />
          </Suspense>
        </ScrollReveal>
      </Container>
    </section>
  );
}
