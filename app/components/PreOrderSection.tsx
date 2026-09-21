"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PREORDER_PRODUCTS } from "../lib/preorder-data";
import { ProductCard } from "./ProductCard";
import { ScrollReveal, CardReveal } from "./Reveal";
import { useLang } from "../lib/i18n";

export function PreOrderSection() {
  const { ui } = useLang();

  // Display 4 featured preorder products
  const featuredPreOrders = PREORDER_PRODUCTS.slice(0, 4);

  return (
    <section className="border-b border-ink-200 bg-gradient-to-b from-gold-50/30 via-white to-white py-10 sm:py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <ScrollReveal className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
          <div>
            <h2 className="ts-display text-xl font-bold tracking-tight text-gold-600 sm:text-2xl lg:text-3xl">
              {ui("preOrderSectionTitle")}
            </h2>
          </div>

          <Link
            href="/pre-order"
            className="group inline-flex shrink-0 items-center gap-1 text-xs font-bold text-gold-600 transition-colors hover:text-gold-700"
          >
            <span>{ui("viewAllPreOrders")}</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </ScrollReveal>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
          {featuredPreOrders.map((product, idx) => (
            <CardReveal key={product.id} delay={idx * 0.08}>
              <ProductCard product={product} />
            </CardReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
