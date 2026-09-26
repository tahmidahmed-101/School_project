"use client";

import { Plus, Minus, ShoppingCart, Zap, Heart, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Product } from "../../lib/types";
import { useLang } from "../../lib/i18n";
import { useCart } from "../../lib/cart";
import { useWishlist } from "../../lib/wishlist";
import { usePreOrderModal } from "../../lib/preorder-modal";
import { getMaxOrderQuantity } from "../../lib/product";

const CTA_BASE =
  "flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3.5 text-xs font-bold uppercase tracking-wider shadow-md transition-all hover:shadow-lg sm:flex-1";
const CTA_DARK = `${CTA_BASE} cursor-pointer bg-brand-700 text-white hover:bg-brand-800`;
const CTA_AMBER = `${CTA_BASE} cursor-pointer bg-gold-500 text-ink-950 hover:bg-gold-400`;

interface ProductActionsProps {
  product: Product;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  selectedVariants: Record<string, string>;
  isSoldOut: boolean;
  /** The chosen SKU can't be bought right now (a regular product with no stock). */
  isOutOfStock?: boolean;
}

/** Quantity stepper, wishlist toggle, purchase buttons and the WhatsApp / call shortcuts. */
export function ProductActions({
  product,
  quantity,
  onQuantityChange,
  selectedVariants,
  isSoldOut,
  isOutOfStock = false,
}: ProductActionsProps) {
  const { ui, n } = useLang();
  const router = useRouter();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { openPreOrderModal } = usePreOrderModal();

  const isWishlisted = isInWishlist(product.id);
  const maxQuantity = getMaxOrderQuantity(product);

  const buyNow = () => {
    addItem(product, quantity, selectedVariants);
    router.push("/checkout");
  };

  const buyNowButton = (
    <button type="button" onClick={buyNow} className={product.isPreOrder ? CTA_DARK : CTA_AMBER}>
      <Zap className={`h-4 w-4 fill-current ${product.isPreOrder ? "text-gold-400" : ""}`} />
      <span>{ui("buyNow")}</span>
    </button>
  );

  return (
    <>
      <div className="mt-7 flex items-center gap-3.5">
        <div className="flex items-center rounded-lg border border-ink-200 bg-ink-50">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="cursor-pointer p-3 text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="px-4 text-sm font-bold text-ink-900">{n(quantity)}</span>
          <button
            type="button"
            onClick={() => onQuantityChange(Math.min(maxQuantity, quantity + 1))}
            className="cursor-pointer p-3 text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => toggleItem(product)}
          className={`flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg border transition-all ${
            isWishlisted
              ? "shadow-xs border-red-500 bg-red-50 text-red-600"
              : "border-ink-200 bg-white text-ink-700 hover:border-ink-900 hover:text-ink-950"
          }`}
          aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current text-red-500" : ""}`} />
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-3.5 sm:flex-row">
        {isOutOfStock ? (
          <button
            type="button"
            disabled
            className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink-200 px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-ink-400 sm:flex-1"
          >
            <span>{ui("outOfStock")}</span>
          </button>
        ) : product.isPreOrder ? (
          isSoldOut ? (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink-200 px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-ink-400 sm:flex-1"
            >
              <span>{ui("preOrderUnavailable")}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openPreOrderModal(product, quantity, selectedVariants)}
              className={CTA_AMBER}
            >
              <Sparkles className="h-4 w-4 fill-current" />
              <span>{ui("preOrderNow")}</span>
            </button>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => addItem(product, quantity, selectedVariants)}
              className={CTA_DARK}
            >
              <ShoppingCart className="h-4 w-4 text-gold-400" />
              <span>{ui("addToCart")}</span>
            </button>
            {buyNowButton}
          </>
        )}
      </div>
    </>
  );
}
