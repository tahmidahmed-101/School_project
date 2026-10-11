"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, CornerDownRight, Layers } from "lucide-react";
import { categoryGroups, useCatalog } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { useClickOutside } from "@/lib/useClickOutside";
import { WithActiveCategory } from "@/modules/catalog";

/** Scrolls a just-opened group into view inside its scrolling list, so its subcategories are not left below the edge. */
function revealGroup(toggle: HTMLElement) {
  const group = toggle.parentElement?.parentElement;
  requestAnimationFrame(() => group?.scrollIntoView({ block: "nearest" }));
}

/** "Shop by Categories" pill in the desktop nav bar with its animated menu. */
export function NavCategoriesMenu() {
  const { lang, t, ui, n } = useLang();
  const { categories: allCategories } = useCatalog();
  // Pre-order has its own nav link and category rail; this menu covers the regular stock catalogue.
  const groups = categoryGroups(allCategories.filter((category) => category.type === "stock"));
  // Groups the visitor opened or closed by hand; the group of the category being viewed starts open.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false));
  const close = () => setIsOpen(false);

  return (
    <div ref={containerRef} className="relative w-60">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex w-full cursor-pointer items-center justify-between rounded-full bg-accent px-5 py-2.5 text-xs font-bold text-ink-950 shadow-sm transition-all duration-200 hover:bg-accent-hover"
      >
        <div className="flex items-center gap-2.5">
          <Layers className="h-4 w-4" />
          <span>{ui("shopByCategories")}</span>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      <div
        className={`absolute left-0 top-full z-50 w-full origin-top overflow-hidden rounded-2xl border border-ink-200 bg-canvas py-3 shadow-2xl transition-all duration-200 ease-out ${
          isOpen
            ? "pointer-events-auto translate-y-2 scale-y-100 opacity-100"
            : "pointer-events-none -translate-y-1 scale-y-95 opacity-0"
        }`}
      >
        {/* The list scrolls past ~9 rows so a long catalogue cannot push the menu off screen; the footer link stays put. */}
        <div className="max-h-80 overflow-y-auto overscroll-contain">
          <WithActiveCategory>
            {(activeCategory) =>
              groups.map(({ main, subs, itemCount }) => {
                const isOpenGroup = toggled[main.id] ?? subs.some(({ category }) => category.slug === activeCategory);
                const items = (count: number) => (
                  <span className="ml-2 shrink-0 text-2xs font-normal text-fg-muted">
                    {n(count)} {lang === "bn" ? "টি" : "items"}
                  </span>
                );
                // Only main categories show at first; the arrow opens the subcategories in a tinted box below.
                return (
                  <div key={main.id}>
                    <div
                      className={`flex items-stretch transition-colors ${
                        activeCategory === main.slug ? "bg-gold-500/15" : "hover:bg-gold-50/70"
                      }`}
                    >
                      <Link
                        href={`/shop?category=${main.slug}`}
                        prefetch={false}
                        onClick={close}
                        className={`flex min-w-0 flex-1 cursor-pointer items-center justify-between py-2.5 pl-5 text-xs font-bold ${
                          subs.length ? "pr-1" : "pr-5"
                        } ${activeCategory === main.slug ? "text-gold-800" : "text-ink-900 hover:text-ink-950"}`}
                      >
                        <span className="truncate">{t(main.name)}</span>
                        {items(itemCount)}
                      </Link>
                      {subs.length > 0 && (
                        <button
                          type="button"
                          aria-expanded={isOpenGroup}
                          aria-label={`${ui("subcategories")}: ${t(main.name)}`}
                          onClick={(event) => {
                            setToggled((prev) => ({ ...prev, [main.id]: !isOpenGroup }));
                            if (!isOpenGroup) revealGroup(event.currentTarget);
                          }}
                          className="flex w-10 shrink-0 cursor-pointer items-center justify-center text-ink-700 hover:text-gold-800"
                        >
                          <ChevronDown
                            className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpenGroup ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    {isOpenGroup && (
                      <div className="mx-3 mb-1.5 mt-0.5 rounded-xl bg-surface-muted py-1">
                        {subs.map(({ category, depth }) => (
                          <Link
                            key={category.id}
                            href={`/shop?category=${category.slug}`}
                            prefetch={false}
                            onClick={close}
                            style={{ paddingLeft: `${0.625 + (depth - 1) * 0.75}rem` }}
                            className={`flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2.5 text-xs transition-colors ${
                              activeCategory === category.slug
                                ? "font-bold text-gold-800"
                                : "font-medium text-ink-700 hover:text-ink-950"
                            }`}
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-ink-300" />
                            <span className="flex-1 truncate">{t(category.name)}</span>
                            {items(category.itemCount)}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            }
          </WithActiveCategory>
        </div>
        <div className="mt-2 border-t border-ink-100 px-5 pt-2">
          <Link
            href="/shop"
            onClick={close}
            className="flex cursor-pointer items-center justify-between text-xs font-bold text-gold-800 hover:text-gold-900"
          >
            <span>{ui("browseAllCategories")}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
