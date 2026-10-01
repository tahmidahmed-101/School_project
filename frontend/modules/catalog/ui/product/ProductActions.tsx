"use client";

import { Plus, Minus, ShoppingCart, Zap, Heart, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { useCart } from "@/modules/cart";
import { useWishlist } from "@/modules/wishlist";
import { usePreOrderModal } from "@/modules/preorder";
import { getMaxOrderQuantity } from "@/lib/product";
import { Button } from "@/design-system/ui/Button";

const CTA = { size: "lg", fullWidth: true, className: "sm:flex-1" } as const;

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
    <Button
      {...CTA}
      variant={product.isPreOrder ? "secondary" : "primary"}
      onClick={buyNow}
      leadingIcon={<Zap className={`h-4 w-4 fill-current ${product.isPreOrder ? "text-gold-400" : ""}`} />}
    >
      {ui("buyNow")}
    </Button>
  );

  return (
    <>
      <div className="mt-7 flex items-center gap-3.5">
        <div className="flex h-12 items-center rounded-full border border-ink-200 bg-ink-50">
          <button
            type="button"
            onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
            className="cursor-pointer p-3 text-ink-500 transition-colors hover:text-ink-900"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-10 text-center text-sm font-bold tabular-nums text-ink-900">{n(quantity)}</span>
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
          className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all ${
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
          <Button {...CTA} variant="outline" disabled>
            {ui("outOfStock")}
          </Button>
        ) : product.isPreOrder ? (
          isSoldOut ? (
            <Button {...CTA} variant="outline" disabled>
              {ui("preOrderUnavailable")}
            </Button>
          ) : (
            <Button
              {...CTA}
              onClick={() => openPreOrderModal(product, quantity, selectedVariants)}
              leadingIcon={<Sparkles className="h-4 w-4 fill-current" />}
            >
              {ui("preOrderNow")}
            </Button>
          )
        ) : (
          <>
            <Button
              {...CTA}
              variant="secondary"
              onClick={() => addItem(product, quantity, selectedVariants)}
              leadingIcon={<ShoppingCart className="h-4 w-4 text-gold-400" />}
            >
              {ui("addToCart")}
            </Button>
            {buyNowButton}
          </>
        )}
      </div>
    </>
  );
}
