import type { Product } from "../lib/types";
import { ProductCard } from "./ProductCard";
import { CardReveal } from "./Reveal";

interface ProductCardGridProps {
  products: Product[];
  /** Full grid classes (columns/gaps); each caller keeps its own layout. */
  className: string;
  /** Stagger step per card, in seconds. */
  delayStep?: number;
  /** Cards per stagger cycle, so later rows don't feel sluggish to reveal. */
  delayCycle?: number;
}

/** Staggered-reveal grid of product cards, shared by every "grid of ProductCard" section. */
export function ProductCardGrid({
  products,
  className,
  delayStep = 0.08,
  delayCycle = 4,
}: ProductCardGridProps) {
  return (
    <div className={className}>
      {products.map((product, idx) => (
        <CardReveal key={product.id} delay={(idx % delayCycle) * delayStep}>
          <ProductCard product={product} />
        </CardReveal>
      ))}
    </div>
  );
}
