"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, ChevronDown, Layers } from "lucide-react";
import { CATEGORIES } from "../lib/data";
import { useLang } from "../lib/i18n";
import { useClickOutside } from "../lib/useClickOutside";

/** "Shop by Categories" pill in the desktop nav bar with its animated menu. */
export function NavCategoriesMenu() {
  const { lang, t, ui, n } = useLang();
  const activeCategory = useSearchParams().get("category");
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false));
  const close = () => setIsOpen(false);

  return (
    <div ref={containerRef} className="relative w-60">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between rounded-full bg-gold-500 px-5 py-2.5 text-xs font-bold text-ink-950 shadow-sm transition-all duration-200 hover:bg-gold-400"
      >
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4" />
          <span>{ui("shopByCategories")}</span>
        </div>
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      <div
        className={`absolute left-0 top-full z-50 w-full origin-top overflow-hidden rounded-2xl border border-ink-200 bg-white py-3 shadow-2xl transition-all duration-200 ease-out ${
          isOpen
            ? "pointer-events-auto translate-y-2 scale-y-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-y-95 opacity-0"
        }`}
      >
        {CATEGORIES.map((category) => (
          <Link
            key={category.id}
            href={`/shop?category=${category.slug}`}
            onClick={close}
            className={`flex cursor-pointer items-center justify-between px-5 py-2.5 text-xs font-semibold transition-colors ${
              activeCategory === category.slug
                ? "bg-gold-500/15 font-bold text-gold-800"
                : "text-ink-700 hover:bg-gold-50/70 hover:text-ink-950"
            }`}
          >
            <span className="truncate">{t(category.name)}</span>
            <span className="ml-2 shrink-0 text-[10px] font-normal text-ink-400">
              {n(category.itemCount)} {lang === "bn" ? "টি" : "items"}
            </span>
          </Link>
        ))}
        <div className="mt-2 border-t border-ink-100 px-5 pt-2">
          <Link
            href="/shop"
            onClick={close}
            className="flex cursor-pointer items-center justify-between text-xs font-bold text-gold-600 hover:text-gold-700"
          >
            <span>{ui("browseAllCategories")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
