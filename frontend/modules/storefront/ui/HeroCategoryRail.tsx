"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronRight, CornerDownRight } from "lucide-react";
import { categoryGroups, useCatalog } from "@/modules/catalog";
import { Collapse } from "@/design-system/patterns/Collapse";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";

/** How long the Collapse panel takes to open, in ms. */
const OPEN_MS = 250;

/** Once a group has slid open, glides it into view inside the scrolling list, so its subcategories are not left below the edge. */
function revealGroup(toggle: HTMLElement) {
  const group = toggle.parentElement?.parentElement;
  setTimeout(() => group?.scrollIntoView({ block: "nearest", behavior: "smooth" }), OPEN_MS);
}

/** Vertical "Shop by Category" list shown on the left of the hero on desktop. */
export function HeroCategoryRail({ preorder = false }: { preorder?: boolean }) {
  const { t, ui } = useLang();
  const { categories } = useCatalog();
  const type = preorder ? "preorder" : "stock";
  const groups = categoryGroups(categories.filter((category) => category.type === type));
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const hrefOf = (slug: string) => (preorder ? `/shop?category=${slug}&type=preorder` : `/shop?category=${slug}`);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-ink-100 bg-canvas p-2.5 shadow-sm sm:rounded-3xl sm:p-3">
      <h2 className="px-1.5 pb-1.5 text-2xs font-bold uppercase tracking-wider text-fg-subtle">
        {ui("heroCategoriesTitle")}
      </h2>
      <nav className="-mr-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1.5">
        {groups.map(({ main, subs }) => {
          const isOpen = Boolean(openGroups[main.id]);
          // Only main categories (with their picture) show at first; the arrow opens the subcategories in a tinted box.
          return (
            <div key={main.id} className="shrink-0">
              <div className="group flex items-stretch rounded-lg transition-colors hover:bg-gold-50/70">
                <Link
                  href={hrefOf(main.slug)}
                  prefetch={false}
                  className="flex min-w-0 flex-1 items-center gap-2 px-1.5 py-2"
                >
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-surface-muted sm:h-9 sm:w-9">
                    <Image src={photo(main.image)} alt="" fill sizes="36px" className="object-cover" />
                  </span>
                  <span className="line-clamp-2 flex-1 text-2xs leading-tight font-bold text-ink-900 group-hover:text-ink-950">
                    {t(main.name)}
                  </span>
                  {subs.length === 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" />
                  )}
                </Link>
                {subs.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-label={`${ui("subcategories")}: ${t(main.name)}`}
                    onClick={(event) => {
                      setOpenGroups((prev) => ({ ...prev, [main.id]: !isOpen }));
                      if (!isOpen) revealGroup(event.currentTarget);
                    }}
                    className="flex w-7 shrink-0 cursor-pointer items-center justify-center text-ink-700 hover:text-gold-700"
                  >
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                )}
              </div>
              <Collapse open={isOpen}>
                <div className="mb-1 ml-3 mt-0.5 rounded-lg bg-surface-muted py-1">
                  {subs.map(({ category, depth }) => (
                    <Link
                      key={category.id}
                      href={hrefOf(category.slug)}
                      prefetch={false}
                      style={{ paddingLeft: `${0.5 + (depth - 1) * 0.625}rem` }}
                      className="flex items-center gap-1.5 py-1.5 pr-2 text-2xs leading-tight font-medium text-ink-700 transition-colors hover:text-ink-950"
                    >
                      <CornerDownRight className="h-3 w-3 shrink-0 text-ink-300" />
                      <span className="line-clamp-2">{t(category.name)}</span>
                    </Link>
                  ))}
                </div>
              </Collapse>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
