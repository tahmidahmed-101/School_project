"use client";

import type { Product } from "@/lib/types";
import { ProductCardGrid } from "./ProductCardGrid";
import { ScrollReveal } from "@/design-system/patterns/Reveal";
import { Container } from "@/design-system/ui/Container";
import { SectionHeading } from "@/design-system/ui/SectionHeading";
import { useLang } from "@/lib/i18n";

interface ProductGridProps {
  products: Product[];
  title?: string;
  viewAllLink?: string;
  viewAllText?: string;
}

export function ProductGrid({ products, title, viewAllLink, viewAllText }: ProductGridProps) {
  const { ui } = useLang();

  const gridColsClass = "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5";

  return (
    // content-visibility: a home page has a dozen of these shelves, and laying them all out up front was the
    // largest cost before first paint on mobile. The intrinsic size is a placeholder until the shelf is measured.
    <section className="border-b border-ink-200 bg-canvas py-8 [contain-intrinsic-size:auto_900px] [content-visibility:auto] sm:py-14">
      <Container>
        {(title || viewAllLink) && (
          <ScrollReveal className="mb-5 sm:mb-8">
            <SectionHeading
              title={title}
              viewAllHref={viewAllLink}
              viewAllLabel={viewAllText || ui("viewAllProducts")}
            />
          </ScrollReveal>
        )}

        <ProductCardGrid products={products} evenOnMobile className={`grid ${gridColsClass} gap-2.5 sm:gap-4`} />
      </Container>
    </section>
  );
}
