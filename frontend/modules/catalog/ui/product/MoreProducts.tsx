"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { getDiscountPercent } from "@/lib/product";

const PAGE_SIZE = 6;

const ARROW =
  "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-brand-800 text-white shadow-2xs transition-colors hover:bg-brand-900 disabled:pointer-events-none disabled:opacity-40";

/** Compact product rows for the rail beside the product details, a page at a time; the arrows slide between pages. */
export function MoreProducts({ products }: { products: Product[] }) {
  const { t, ui, money } = useLang();
  const [page, setPage] = useState(0);
  const pages = Array.from({ length: Math.ceil(products.length / PAGE_SIZE) }, (_, i) =>
    products.slice(i * PAGE_SIZE, (i + 1) * PAGE_SIZE),
  );

  return (
    <div className="rounded-xl border border-ink-200 bg-canvas p-4">
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 pb-3">
        <h2 className="text-sm font-bold text-fg">{ui("moreProducts")}</h2>
        {pages.length > 1 && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0}
              aria-label={ui("previousSlide")}
              className={ARROW}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === pages.length - 1}
              aria-label={ui("nextSlide")}
              className={ARROW}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden">
        <div
          className="flex items-start transition-transform duration-300 ease-out motion-reduce:transition-none"
          style={{ transform: `translateX(-${page * 100}%)` }}
        >
          {pages.map((items, i) => (
            <ul key={i} inert={i !== page} className="w-full shrink-0 divide-y divide-ink-100">
              {items.map((product) => (
                <li key={product.id}>
                  <Link href={`/product/${product.slug}`} className="group flex items-center gap-3 py-3">
                    <span className="relative block h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-ink-100 bg-surface">
                      <Image
                        src={photo(product.image)}
                        alt={t(product.name)}
                        fill
                        sizes="64px"
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="line-clamp-2 text-xs font-bold leading-tight text-fg transition-colors group-hover:text-gold-800">
                        {t(product.name)}
                      </span>
                      <span className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="text-xs font-bold text-gold-800 sm:text-sm">{money(product.price)}</span>
                        {getDiscountPercent(product) && product.compareAtPrice && (
                          <span className="text-2xs font-medium text-fg-muted line-through">
                            {money(product.compareAtPrice)}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}
