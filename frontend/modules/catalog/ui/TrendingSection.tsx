"use client";

import type { ReactNode } from "react";
import type { Product } from "@/lib/types";
import { useProducts } from "../context";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { useLang } from "@/lib/i18n";

interface TrendingSectionProps {
  /** Defaults to every non-pre-order product. */
  products?: Product[];
  title?: string;
  /** Hide the top-right "View all" link (e.g. when this section already shows the full catalogue). */
  showViewAllLink?: boolean;
  /** Optional content rendered below the header row and above the grid, e.g. a category tab filter. */
  filters?: ReactNode;
}

export function TrendingSection({ products, title, showViewAllLink = true, filters }: TrendingSectionProps) {
  const { ui } = useLang();
  const { stockProducts } = useProducts();

  // Default teaser: a handful of picks, not the full catalogue (that's what "View all" is for)
  const sourceProducts = products ?? stockProducts.slice(0, 10);

  return (
    <section className="border-b border-ink-200 bg-canvas py-8 sm:py-14">
      <Container>
        <ScrollReveal className={filters ? "mb-1.5 sm:mb-2" : "mb-6 sm:mb-8"}>
          <SectionHeading
            title={title ?? ui("featuredTitle")}
            viewAllHref={showViewAllLink ? "/shop" : undefined}
            viewAllLabel={ui("viewAllProducts")}
          />
        </ScrollReveal>

        {filters}

        {/* Product Grid with CardReveal kinetic stagger */}
        <ProductCardGrid
          products={sourceProducts}
          evenOnMobile
          className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
        />
      </Container>
    </section>
  );
}
