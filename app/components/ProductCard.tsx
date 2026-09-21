"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart, ShoppingBag, Sparkles, Calendar } from "lucide-react";
import type { Product } from "../lib/types";
import { useLang } from "../lib/i18n";
import { useCart } from "../lib/cart";
import { useWishlist } from "../lib/wishlist";
import { usePreOrderModal } from "../lib/preorder-modal";
import { photo } from "../lib/photo";
import { getDiscountPercent, isPreOrderSoldOut } from "../lib/product";
import { PreOrderBadge } from "./PreOrderBadge";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const { t, ui, money, n } = useLang();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { openPreOrderModal } = usePreOrderModal();

  const isWishlisted = isInWishlist(product.id);

  const discountPercent = getDiscountPercent(product);
  const isSoldOut = isPreOrderSoldOut(product);

  return (
    <div className="group relative flex flex-col justify-between rounded-2xl border border-ink-200/90 bg-white p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-400/70 hover:shadow-lg hover:shadow-ink-200/60 sm:p-2.5">
      {/* Top Image Area */}
      <div className="relative mb-1.5 aspect-square w-full overflow-hidden rounded-xl border border-ink-100 bg-ink-50 sm:mb-2">
        <Link href={`/product/${product.slug}`} className="relative block h-full w-full">
          <Image
            src={photo(product.image)}
            alt={t(product.name)}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 260px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </Link>

        {/* Badges: Preorder Badge or Discount Badge */}
        <div className="pointer-events-none absolute left-1.5 top-1.5 z-10 flex flex-col gap-1">
          {product.isPreOrder ? (
            <PreOrderBadge status={product.preorderStatus} size="sm" />
          ) : (
            discountPercent && (
              <span className="shadow-xs rounded-md bg-red-600 px-1.5 py-0.5 text-[8.5px] font-bold tracking-wide text-white sm:text-[9.5px]">
                {n(discountPercent)}% {ui("off")}
              </span>
            )
          )}
        </div>

        {/* Wishlist Button (Top Right) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleItem(product);
          }}
          className="absolute right-1.5 top-1.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-ink-200/80 bg-white/90 text-ink-700 shadow-2xs backdrop-blur-sm transition-all hover:scale-110 hover:bg-white hover:text-red-500 sm:h-8 sm:w-8"
          aria-label="Toggle wishlist"
        >
          <Heart
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
              isWishlisted ? "fill-red-500 text-red-500" : ""
            }`}
          />
        </button>
      </div>

      {/* Product Info */}
      <div className="flex flex-1 flex-col justify-between">
        <div className="space-y-0.5">
          <p className="truncate text-[9.5px] font-semibold text-ink-400 sm:text-[10.5px]">
            {t(product.categoryName)}
          </p>
          <Link
            href={`/product/${product.slug}`}
            className="line-clamp-1 text-xs font-bold text-ink-900 transition-colors group-hover:text-gold-600 sm:text-[13px]"
            title={t(product.name)}
          >
            {t(product.name)}
          </Link>

          {/* Pre-order Expected Delivery Info */}
          {product.isPreOrder && product.expectedDelivery && (
            <div className="flex items-center gap-1 pt-0.5 text-[9.5px] font-medium text-gold-700 sm:text-[10px]">
              <Calendar className="h-3 w-3 shrink-0 text-gold-600" />
              <span className="truncate">
                {ui("expectedDelivery")}: {t(product.expectedDelivery)}
              </span>
            </div>
          )}
        </div>

        {/* Price & Action Row (Side-by-Side) */}
        <div className="mt-2 flex items-center justify-between gap-1.5 border-t border-ink-100 pt-1.5 sm:pt-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold text-gold-600 sm:text-[13px]">
              {money(product.price)}
            </div>
            {discountPercent && product.compareAtPrice && (
              <div className="truncate text-[9.5px] font-medium text-ink-400 line-through sm:text-[10.5px]">
                {money(product.compareAtPrice)}
              </div>
            )}
          </div>

          {product.isPreOrder ? (
            isSoldOut ? (
              <button
                type="button"
                disabled
                className="flex min-w-[88px] shrink-0 cursor-not-allowed items-center justify-center gap-1 whitespace-nowrap rounded-full bg-ink-200 px-2 py-1.5 text-[9.5px] font-bold text-ink-500 sm:min-w-[124px] sm:px-3 sm:py-2 sm:text-xs"
                title={ui("preOrderCapacityReached")}
              >
                <span>{ui("preOrderUnavailable")}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openPreOrderModal(product)}
                className="shadow-xs flex min-w-[88px] shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full bg-gold-500 px-2.5 py-1.5 text-[10px] font-bold text-ink-950 transition-all hover:scale-[1.02] hover:bg-gold-400 active:scale-95 sm:min-w-[124px] sm:gap-1.5 sm:px-4 sm:py-2 sm:text-xs"
                aria-label={`${ui("preOrderNow")} - ${t(product.name)}`}
              >
                <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span>{ui("preOrderNow")}</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => addItem(product)}
              className="shadow-xs flex min-w-[88px] shrink-0 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full bg-gold-500 px-2.5 py-1.5 text-[10.5px] font-bold text-ink-950 transition-all hover:scale-[1.02] hover:bg-gold-400 active:scale-95 sm:min-w-[124px] sm:gap-1.5 sm:px-5 sm:py-2 sm:text-xs"
              aria-label={`${ui("addToCart")} - ${t(product.name)}`}
            >
              <ShoppingBag className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              <span>{ui("addToCart")}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
