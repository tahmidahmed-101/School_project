"use client";

import { Star } from "lucide-react";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { getDiscountPercent } from "@/lib/product";
import { DiscountBadge } from "@/design-system/patterns/DiscountBadge";

interface ProductSummaryProps {
  product: Product;
  isSoldOut: boolean;
}

/** Category, title, price, rating and availability line at the top of the details column. */
export function ProductSummary({ product, isSoldOut }: ProductSummaryProps) {
  const { t, money, n } = useLang();
  const discountPercent = getDiscountPercent(product);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-widest text-gold-800">{t(product.categoryName)}</span>
      </div>
      <h1 className="ts-display mt-2.5 text-2xl font-bold leading-tight text-ink-950 sm:text-3xl">{t(product.name)}</h1>

      {/* Price and availability share one line (they wrap only when the screen is too narrow) */}
      <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-2">
        <span className="text-2xl font-extrabold text-ink-950 sm:text-3xl">{money(product.price)}</span>
        {discountPercent && product.compareAtPrice && (
          <span className="text-base text-fg-subtle line-through">{money(product.compareAtPrice)}</span>
        )}
        {discountPercent && <DiscountBadge percent={discountPercent} size="md" tone="soft" />}
        <span className="h-5 w-px bg-surface-strong" aria-hidden="true" />
        <div className="text-xs">
          <Availability product={product} isSoldOut={isSoldOut} />
        </div>
      </div>

      {product.reviewCount > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <div className="flex items-center gap-0.5 text-gold-400">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${
                  i < Math.round(product.rating) ? "fill-gold-400 text-gold-400" : "fill-ink-200 text-ink-300"
                }`}
              />
            ))}
          </div>
          <span className="font-medium text-fg-subtle">({n(product.reviewCount)})</span>
        </div>
      )}
    </>
  );
}

function Availability({ product, isSoldOut }: ProductSummaryProps) {
  const { ui } = useLang();

  if (!product.isPreOrder && !product.inStock) {
    return (
      <div className="flex items-center gap-1.5 font-semibold text-danger">
        <span className="h-2 w-2 rounded-full bg-danger" />
        <span>{ui("outOfStock")}</span>
      </div>
    );
  }

  if (!product.isPreOrder) {
    return (
      <div className="flex items-center gap-1.5 font-semibold text-brand-700">
        <span className="h-2 w-2 animate-pulse rounded-full bg-brand-500" />
        <span>{ui("inStock")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 font-semibold">
      {isSoldOut ? (
        <span className="flex items-center gap-1.5 text-danger">
          <span className="h-2 w-2 rounded-full bg-danger" />
          {ui("preOrderSoldOut")}
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-gold-800">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" />
          {ui(product.preorderStatus === "closing-soon" ? "preOrderClosingSoon" : "preOrderOpen")}
        </span>
      )}
    </div>
  );
}
