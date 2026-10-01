"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useCatalog } from "@/modules/catalog";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";

/** Vertical "Shop by Category" list shown on the left of the hero on desktop. */
export function HeroCategoryRail({ preorder = false }: { preorder?: boolean }) {
  const { t, ui } = useLang();
  const { categories } = useCatalog();
  const type = preorder ? "preorder" : "stock";
  const visibleCategories = categories.filter((category) => category.type === type);

  return (
    <div className="flex h-full flex-col rounded-2xl border border-ink-100 bg-white p-2.5 shadow-sm sm:rounded-[24px] sm:p-3">
      <h2 className="px-1.5 pb-1.5 text-2xs font-bold uppercase tracking-wider text-ink-500">
        {ui("heroCategoriesTitle")}
      </h2>
      <nav className="-mr-1.5 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pr-1.5">
        {visibleCategories.map((category) => (
          <Link
            key={category.id}
            href={preorder ? `/shop?category=${category.slug}&type=preorder` : `/shop?category=${category.slug}`}
            className="group flex items-center gap-2 rounded-lg px-1.5 py-2 transition-colors hover:bg-gold-50/70"
          >
            <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-lg bg-ink-100 sm:h-9 sm:w-9">
              <Image src={photo(category.image)} alt="" fill sizes="36px" className="object-cover" />
            </span>
            <span className="line-clamp-2 flex-1 text-2xs leading-tight font-semibold text-ink-700 group-hover:text-ink-950">
              {t(category.name)}
            </span>
            <ChevronRight className="h-3 w-3 shrink-0 text-ink-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" />
          </Link>
        ))}
      </nav>
    </div>
  );
}
