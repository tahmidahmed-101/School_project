"use client";

import Image from "next/image";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import type { Product } from "@/lib/types";
import { useCart } from "@/modules/cart";
import { useLang } from "@/lib/i18n";
import { photo } from "@/lib/photo";
import { getDiscountPercent } from "@/lib/product";

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
        className="relative block h-28 w-28 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-100"
      >
        <Image
          src={photo(product.image)}
          alt={t(product.name)}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="112px"
        />
        {discountPercent && (
          <span className="shadow-xs absolute left-2 top-2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
            {discountPercent}% {ui("off")}
          </span>
        )}
      </Link>

      <div className="w-full min-w-0 flex-1 space-y-1 text-left">
        <div className="flex items-center gap-2 text-[11px] font-semibold text-gold-600">
          <span>{t(product.categoryName)}</span>
        </div>

        <Link href={href}>
          <h4 className="ts-display text-base font-bold leading-snug text-ink-900 transition-colors group-hover:text-gold-600">
            {t(product.name)}
          </h4>
        </Link>

        <p className="line-clamp-2 text-xs leading-relaxed text-ink-500">
          {t(product.tagline.en ? product.tagline : product.description)}
        </p>
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-ink-100 pt-3 sm:w-auto sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
        <div className="text-right">
          <span className="text-base font-bold text-gold-600 sm:text-lg">{money(product.price)}</span>
          {discountPercent && product.compareAtPrice && (
            <span className="block text-xs text-ink-400 line-through">{money(product.compareAtPrice)}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() => addItem(product)}
          className="shadow-xs flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full bg-gold-500 px-3.5 py-1.5 text-[11px] font-bold text-ink-950 transition-colors hover:bg-gold-400 sm:px-5 sm:py-2 sm:text-xs"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span>{ui("addToCart")}</span>
        </button>
      </div>
    </div>
  );
}
