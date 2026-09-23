"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "../lib/types";
import { PRODUCTS } from "../lib/data";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "./Reveal";
import { useLang } from "../lib/i18n";

interface TrendingSectionProps {
  /** Defaults to every non-pre-order product. */
  products?: Product[];
  title?: string;
  /** Hide the top-right "View all" link (e.g. when this section already shows the full catalogue). */
  showViewAllLink?: boolean;
}

export function TrendingSection({ products, title, showViewAllLink = true }: TrendingSectionProps) {
  const { ui } = useLang();

  // Default teaser: a handful of picks, not the full catalogue (that's what "View all" is for)
  const sourceProducts = products ?? PRODUCTS.filter((p) => !p.isPreOrder).slice(0, 12);

  return (
    <section className="border-b border-ink-200 bg-white py-8 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header: Title & View All */}
        <ScrollReveal className="mb-6 flex flex-nowrap items-center justify-between gap-2 sm:mb-8 sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="ts-display truncate text-xl font-extrabold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
              {title ?? ui("featuredTitle")}
            </h2>
          </div>

          {showViewAllLink && (
            <Link
              href="/shop"
              className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-gold-600 transition-colors hover:text-gold-700 sm:text-sm"
            >
              <span>{ui("viewAllProducts")}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
        </ScrollReveal>

        {/* Product Grid with CardReveal kinetic stagger */}
        <ProductCardGrid
          products={sourceProducts}
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5"
        />
      </div>
    </section>
  );
}
