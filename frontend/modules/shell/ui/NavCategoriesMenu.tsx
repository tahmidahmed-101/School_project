"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, CornerDownRight, Layers } from "lucide-react";
import { categoryGroups, useCatalog, WithPageKind } from "@/modules/catalog";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { shopListing, type ProductKind } from "@/lib/product";
import { useClickOutside } from "@/lib/useClickOutside";
import { WithActiveCategory } from "@/modules/catalog";
import { Collapse } from "@/design-system/patterns/Collapse";

/** How long the Collapse panel takes to open, in ms. */
const OPEN_MS = 250;

/** Once a group has slid open, glides it into view inside the scrolling list, so its subcategories are not left below the edge. */
function revealGroup(toggle: HTMLElement) {
  const group = toggle.parentElement?.parentElement;
  setTimeout(() => group?.scrollIntoView({ block: "nearest", behavior: "smooth" }), OPEN_MS);
}

/** "Shop by Categories" pill in the desktop nav bar: the categories of the shop the visitor is in. */
export function NavCategoriesMenu() {
  const { kind: basket } = useCart();
  return <WithPageKind basket={basket}>{(kind) => <ShopCategoriesMenu kind={kind} />}</WithPageKind>;
}

function ShopCategoriesMenu({ kind }: { kind: ProductKind }) {
  const { t, ui } = useLang();
  const { categories: allCategories } = useCatalog();
  // Each shop lists only its own categories: stock pages the stock tree, pre-order pages the pre-order tree.
  const groups = categoryGroups(allCategories.filter((category) => category.type === kind));
  const categoryHref = (slug: string) => shopListing(kind, { category: slug });
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
              groups.map(({ main, subs }) => {
                const isOpenGroup = toggled[main.id] ?? subs.some(({ category }) => category.slug === activeCategory);
                // An arrow, as on the hero's category rail, rather than an item count.
                const arrow = (
                  <ChevronRight className="ml-2 h-3 w-3 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" />
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
                        href={categoryHref(main.slug)}
                        prefetch={false}
                        onClick={close}
                        className={`group flex min-w-0 flex-1 cursor-pointer items-center justify-between py-2.5 pl-5 text-xs font-bold ${
                          subs.length ? "pr-1" : "pr-5"
                        } ${activeCategory === main.slug ? "text-gold-800" : "text-ink-900 hover:text-ink-950"}`}
                      >
                        <span className="truncate">{t(main.name)}</span>
                        {/* A group with subcategories shows only the down arrow of its toggle, as on the hero rail. */}
                        {subs.length === 0 && arrow}
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
                          // Same right edge and size as the other rows' arrow, so the arrows line up in one column.
                          className="flex shrink-0 cursor-pointer items-center justify-end pl-3 pr-5 text-ink-700 hover:text-gold-800"
                        >
                          <ChevronDown
                            className={`h-3 w-3 transition-transform duration-200 ${isOpenGroup ? "rotate-180" : ""}`}
                          />
                        </button>
                      )}
                    </div>
                    <Collapse open={isOpenGroup}>
                      <div className="mx-3 mb-1.5 mt-0.5 rounded-xl bg-surface-muted py-1">
                        {subs.map(({ category, depth }) => (
                          <Link
                            key={category.id}
                            href={categoryHref(category.slug)}
                            prefetch={false}
                            onClick={close}
                            style={{ paddingLeft: `${0.625 + (depth - 1) * 0.75}rem` }}
                            className={`group flex cursor-pointer items-center gap-1.5 rounded-lg py-1.5 pr-2.5 text-xs transition-colors ${
                              activeCategory === category.slug
                                ? "font-bold text-gold-800"
                                : "font-medium text-ink-700 hover:text-ink-950"
                            }`}
                          >
                            <CornerDownRight className="h-3 w-3 shrink-0 text-ink-300" />
                            <span className="flex-1 truncate">{t(category.name)}</span>
                            {arrow}
                          </Link>
                        ))}
                      </div>
                    </Collapse>
                  </div>
                );
              })
            }
          </WithActiveCategory>
        </div>
        <div className="mt-2 border-t border-ink-100 px-5 pt-2">
          <Link
            href={shopListing(kind)}
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
