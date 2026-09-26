"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Heart, ShoppingCart, Zap, Sparkles, Calendar } from "lucide-react";
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
  const router = useRouter();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { openPreOrderModal } = usePreOrderModal();

  const isWishlisted = isInWishlist(product.id);

  const discountPercent = getDiscountPercent(product);
  const isSoldOut = isPreOrderSoldOut(product);
  const isOutOfStock = !product.isPreOrder && !product.inStock;

  const orderNow = () => {
    addItem(product);
    router.push("/checkout");
  };

  return (
    <div className="group relative flex h-full flex-col justify-between rounded-xl border border-ink-200/90 bg-white p-2 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold-400/70 hover:shadow-lg hover:shadow-ink-200/60 sm:p-2.5">
      {/* Top Image Area */}
      <div className="relative mb-1.5 aspect-square w-full overflow-hidden rounded-lg border border-ink-100 bg-ink-50 sm:mb-2">
        <Link href={`/product/${product.slug}`} className="relative block h-full w-full">
          <Image
            src={photo(product.image)}
            alt={t(product.name)}
            fill
            sizes="(max-width: 640px) 30vw, (max-width: 1024px) 20vw, 180px"
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        </Link>

        {/* Badges: Preorder Badge or Discount Badge */}
        <div className="pointer-events-none absolute left-1 top-1 z-10 flex flex-col gap-1">
          {product.isPreOrder ? (
            <PreOrderBadge status={product.preorderStatus} size="sm" />
          ) : (
            discountPercent && (
              <span className="shadow-xs rounded-md bg-red-600 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-white sm:text-[9px]">
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
          className="absolute right-1 top-1 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-ink-200/80 bg-white/90 text-ink-700 shadow-2xs backdrop-blur-sm transition-all hover:scale-110 hover:bg-white hover:text-red-500 sm:h-8 sm:w-8"
          aria-label="Toggle wishlist"
        >
          <Heart
            className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
              isWishlisted ? "fill-red-500 text-red-500" : ""
            }`}
          />
        </button>
      </div>

      {/* Product Info (centered) */}
      <div className="flex flex-1 flex-col items-center justify-between text-center">
        <div className="space-y-0.5">
          <Link
            href={`/product/${product.slug}`}
            className="line-clamp-2 min-h-[2.5em] text-xs font-bold leading-tight text-ink-900 transition-colors group-hover:text-gold-600 sm:text-sm"
            title={t(product.name)}
          >
            {t(product.name)}
          </Link>

          {product.productCode && (
            <p className="text-[9.5px] font-medium leading-tight text-ink-500 sm:text-[10.5px]">
              {ui("productCode")}: {n(product.productCode)}
              {product.productType && ` (${t(product.productType)})`}
            </p>
          )}

          {/* Pre-order Expected Delivery Info: short date only, wraps instead of overflowing */}
          {product.isPreOrder && product.expectedDelivery && (
            <div
              className="mx-auto mt-0.5 flex w-full max-w-full items-start justify-center gap-1 text-[9px] font-medium leading-snug text-gold-700 sm:text-[10px]"
              title={`${ui("expectedDelivery")}: ${t(product.expectedDelivery)}`}
            >
              <Calendar className="h-3 w-3 shrink-0 translate-y-px text-gold-600" />
              <span className="max-w-full break-words text-center">
                {t(product.expectedDelivery)}
              </span>
            </div>
          )}
        </div>

        {/* Price & Actions (centered, stacked) */}
        <div className="mt-2 flex w-full flex-col items-center gap-1.5 border-t border-ink-100 pt-2">
          <div className="flex flex-wrap items-baseline justify-center gap-x-1.5">
            <span className="text-xs font-bold text-gold-600 sm:text-sm">
              {money(product.price)}
            </span>
            {discountPercent && product.compareAtPrice && (
              <span className="text-[9.5px] font-medium text-ink-400 line-through sm:text-[10.5px]">
                {money(product.compareAtPrice)}
              </span>
            )}
          </div>

          {isOutOfStock ? (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-1 whitespace-nowrap rounded-full bg-ink-200 px-2.5 py-2 text-[10px] font-bold text-ink-500 sm:text-xs"
            >
              <span>{ui("outOfStock")}</span>
            </button>
          ) : product.isPreOrder ? (
            isSoldOut ? (
              <button
                type="button"
                disabled
                className="flex w-full cursor-not-allowed items-center justify-center gap-1 whitespace-nowrap rounded-full bg-ink-200 px-2.5 py-2 text-[10px] font-bold text-ink-500 sm:text-xs"
                title={ui("preOrderCapacityReached")}
              >
                <span>{ui("preOrderUnavailable")}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openPreOrderModal(product)}
                className="shadow-xs flex w-full cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full bg-gold-500 px-3 py-2 text-[10px] font-bold text-ink-950 transition-all hover:scale-[1.02] hover:bg-gold-400 active:scale-95 sm:text-xs"
                aria-label={`${ui("preOrderNow")} - ${t(product.name)}`}
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{ui("preOrderNow")}</span>
              </button>
            )
          ) : (
            <div className="flex w-full items-center gap-1.5">
              <button
                type="button"
                onClick={() => addItem(product)}
                className="shadow-xs flex h-8 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-700 transition-all hover:scale-[1.05] hover:border-gold-400 hover:text-gold-600 active:scale-95"
                aria-label={`${ui("addToCart")} - ${t(product.name)}`}
                title={ui("addToCart")}
              >
                <ShoppingCart className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={orderNow}
                className="shadow-xs flex flex-1 cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full bg-gold-500 px-3 py-2 text-[10px] font-bold text-ink-950 transition-all hover:scale-[1.02] hover:bg-gold-400 active:scale-95 sm:text-xs"
                aria-label={`${ui("orderNow")} - ${t(product.name)}`}
              >
                <Zap className="h-3.5 w-3.5 shrink-0 fill-current" />
                <span>{ui("orderNow")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
