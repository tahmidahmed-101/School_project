"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/types";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { getDiscountPercent } from "@/lib/product";
import { DiscountBadge } from "@/design-system/patterns/DiscountBadge";
import { Button } from "@/design-system/ui/Button";

/** Horizontal product row used by the shop's list view. */
export function ProductListItem({ product }: { product: Product }) {
  const { t, ui, money } = useLang();
  const { addItem } = useCart();
  const discountPercent = getDiscountPercent(product);
  const href = `/product/${product.slug}`;

  return (
    <div className="group flex flex-col items-center gap-4 rounded-2xl border border-ink-200/80 bg-white p-4 transition-all hover:border-gold-400/80 hover:shadow-lg sm:flex-row">
      <Link
        href={href}
        className="relative block h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-surface-muted"
      >
        <Image
          src={photo(product.image)}
          alt={t(product.name)}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="112px"
        />
        {discountPercent && <DiscountBadge percent={discountPercent} className="absolute left-2 top-2" />}
      </Link>

      <div className="w-full min-w-0 flex-1 space-y-1 text-left">
        <div className="flex items-center gap-2 text-2xs font-semibold text-gold-800">
          <span>{t(product.categoryName)}</span>
        </div>

        <Link href={href}>
          <h4 className="ts-display text-base font-bold leading-snug text-fg transition-colors group-hover:text-gold-800">
            {t(product.name)}
          </h4>
        </Link>

        <p className="line-clamp-2 text-xs leading-relaxed text-fg-subtle">
          {t(product.tagline.en ? product.tagline : product.description)}
        </p>
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-ink-100 pt-3 sm:w-auto sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
        <div className="text-right">
          <span className="text-base font-bold text-gold-800 sm:text-lg">{money(product.price)}</span>
          {discountPercent && product.compareAtPrice && (
            <span className="block text-xs text-fg-muted line-through">{money(product.compareAtPrice)}</span>
          )}
        </div>
        <Button
          size="xs"
          onClick={() => addItem(product)}
          aria-label={`${ui("addToCart")} - ${t(product.name)}`}
          leadingIcon={<ShoppingCart className="h-3.5 w-3.5" />}
        >
          {ui("addToCart")}
        </Button>
      </div>
    </div>
  );
}
