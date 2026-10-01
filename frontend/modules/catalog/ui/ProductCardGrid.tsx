"use client";

import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { ProductCard } from "./ProductCard";
import { CardReveal } from "@/design-system/patterns/Reveal";

interface ProductCardGridProps {
  products: Product[];
  /** Full grid classes (columns/gaps); each caller keeps its own layout. */
  className: string;
  /** Delay added between each card's reveal within its row, in seconds. */
  stagger?: number;
  /** Leading cards rendered visible with eager images, for grids that start above the fold. */
  eagerCount?: number;
  /** Hide an odd trailing card on the 2-column mobile grid so no row ends with a lone card. */
  evenOnMobile?: boolean;
}

/** Tracks how many columns the grid is actually rendering right now, so each card's reveal
 * delay lines up with its real position in its row at any breakpoint. */
function useColumnCount(ref: React.RefObject<HTMLDivElement | null>) {
  const [columns, setColumns] = useState(1);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const count = getComputedStyle(el).gridTemplateColumns.split(" ").filter(Boolean).length;
      if (count > 0) setColumns(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return columns;
}

/**
 * Grid of product cards where each row reveals itself, left to right, the moment that row
 * scrolls into view — rather than the whole grid animating in at once.
 */
export function ProductCardGrid({
  products,
  className,
  stagger = 0.08,
  eagerCount = 0,
  evenOnMobile = false,
}: ProductCardGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useColumnCount(gridRef);
  const orphanIdx = evenOnMobile && products.length > 1 && products.length % 2 === 1 ? products.length - 1 : -1;

  return (
    <div ref={gridRef} className={className}>
      {products.map((product, idx) =>
        idx < eagerCount ? (
          <div key={product.id} className={idx === orphanIdx ? "h-full max-sm:hidden" : "h-full"}>
            <ProductCard product={product} priority />
          </div>
        ) : (
          <CardReveal
            key={product.id}
            delay={(idx % columns) * stagger}
            className={idx === orphanIdx ? "h-full max-sm:hidden" : "h-full"}
          >
            <ProductCard product={product} />
          </CardReveal>
        ),
      )}
    </div>
  );
}
