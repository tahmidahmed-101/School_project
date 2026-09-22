"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "../lib/types";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "./Reveal";
import { useLang } from "../lib/i18n";

interface ProductGridProps {
  products: Product[];
  title?: string;
  subtitle?: string;
  viewAllLink?: string;
  viewAllText?: string;
  columns?: 2 | 3 | 4;
}

export function ProductGrid({
  products,
  title,
  subtitle,
  viewAllLink,
  viewAllText,
  columns = 4,
}: ProductGridProps) {
  const { ui } = useLang();

  const gridColsClass =
    columns === 3
      ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
      : "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";

  return (
    <section className="border-b border-ink-200 bg-white py-8 sm:py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {(title || viewAllLink) && (
          <ScrollReveal className="mb-5 flex flex-nowrap items-center justify-between gap-2 sm:mb-8 sm:gap-4">
            <div className="min-w-0 flex-1">
              {title && (
                <h2 className="ts-display truncate text-base font-bold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 truncate text-xs text-ink-600 sm:text-sm">{subtitle}</p>
              )}
            </div>

            {viewAllLink && (
              <Link
                href={viewAllLink}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-gold-600 transition-colors hover:text-gold-700"
              >
                <span>{viewAllText || ui("viewAllProducts")}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
          </ScrollReveal>
        )}

        <ProductCardGrid
          products={products}
          className={`grid ${gridColsClass} gap-3 sm:gap-6`}
          delayCycle={columns}
        />
      </div>
    </section>
  );
}
