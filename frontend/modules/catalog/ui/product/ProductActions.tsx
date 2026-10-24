"use client";

import { ShoppingCart, Zap, Heart, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/types";
import { useLang } from "@/lib/i18n";
import { useCart } from "@/modules/cart";
import { useWishlist } from "@/modules/wishlist";
import { usePreOrderModal } from "@/modules/preorder";
import { getMaxOrderQuantity, getMinOrderQuantity, unavailableLabel } from "@/lib/product";
import { Button } from "@/design-system/ui/Button";
import { QuantityStepper } from "@/design-system/patterns/QuantityStepper";

const CTA = { size: "lg", fullWidth: true } as const;

interface ProductActionsProps {
  product: Product;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  /** The SKU the picker resolved to; undefined while an option is still to be picked. */
  variantId?: string;
  /** What to pick next, shown while the purchase buttons wait for it. */
  hint?: string;
  isSoldOut: boolean;
  /** The chosen SKU can't be bought right now (a regular product with no stock). */
  isOutOfStock?: boolean;
}

/** Quantity stepper, wishlist toggle, purchase buttons and the WhatsApp / call shortcuts. */
export function ProductActions({
  product,
  quantity,
  onQuantityChange,
  variantId,
  hint,
  isSoldOut,
  isOutOfStock = false,
}: ProductActionsProps) {
  const { ui, n } = useLang();
  const router = useRouter();
  const { addItem } = useCart();
  const { toggleItem, isInWishlist } = useWishlist();
  const { openPreOrderModal } = usePreOrderModal();

  const isWishlisted = isInWishlist(product.id);
  const minQuantity = getMinOrderQuantity(product);
  // Never below the minimum, even when less capacity is left: the backend then says how many remain.
  const maxQuantity = Math.max(minQuantity, getMaxOrderQuantity(product));

  const canBuy = !isOutOfStock && !(product.isPreOrder && isSoldOut);
  const waiting = !variantId;
  const hintId = waiting && hint && canBuy ? "option-hint" : undefined;

  const buyNow = () => {
    if (addItem(product, quantity, variantId, { openDrawer: false })) router.push("/checkout");
  };

  const showBuyNow = !isOutOfStock && !product.isPreOrder;
  const buyNowButton = (
    <Button
      {...CTA}
      variant={product.isPreOrder ? "secondary" : "primary"}
      onClick={buyNow}
      disabled={waiting}
      aria-describedby={hintId}
      // Animated only once it can be pressed: a shaking button that does nothing reads as broken.
      className={waiting ? undefined : "cta-attention"}
      leadingIcon={<Zap className={`h-4 w-4 fill-current ${product.isPreOrder ? "text-gold-400" : ""}`} />}
    >
      {ui("buyNow")}
    </Button>
  );

  return (
    <>
      {/* Quantity and the wishlist toggle share a row; below it, the main button and "buy now" sit side by side
          from tablet width up and stack on a phone. */}
      <div className="mt-7 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <QuantityStepper
            size="lg"
            quantity={quantity}
            onChange={onQuantityChange}
            min={minQuantity}
            max={maxQuantity}
          />
          <button
            type="button"
            onClick={() => toggleItem(product)}
            className={`flex h-12 w-12 flex-shrink-0 cursor-pointer items-center justify-center rounded-full border transition-all ${
              isWishlisted
                ? "shadow-xs border-red-500 bg-danger-surface text-danger"
                : "border-ink-200 bg-canvas text-ink-700 hover:border-ink-900 hover:text-ink-950"
            }`}
            aria-label={ui("navWishlist")}
            aria-pressed={isWishlisted}
          >
            <Heart className={`h-5 w-5 ${isWishlisted ? "fill-current text-red-500" : ""}`} />
          </button>
        </div>

        {minQuantity > 1 && (
          <p className="text-xs font-semibold text-gold-900">
            {ui("preOrderMinQuantity").replace("{count}", n(minQuantity))}
          </p>
        )}

        <div className={`grid gap-3 ${showBuyNow ? "sm:grid-cols-2" : ""}`}>
          {isOutOfStock ? (
            <Button {...CTA} variant="outline" disabled>
              {ui(unavailableLabel(product))}
            </Button>
          ) : product.isPreOrder ? (
            isSoldOut ? (
              <Button {...CTA} variant="outline" disabled>
                {ui("preOrderUnavailable")}
              </Button>
            ) : (
              <Button
                {...CTA}
                onClick={() => openPreOrderModal(product, quantity, variantId)}
                disabled={waiting}
                aria-describedby={hintId}
                leadingIcon={<Sparkles className="h-4 w-4 fill-current" />}
              >
                {ui("preOrderNow")}
              </Button>
            )
          ) : (
            <Button
              {...CTA}
              variant="secondary"
              onClick={() => addItem(product, quantity, variantId)}
              disabled={waiting}
              aria-describedby={hintId}
              leadingIcon={<ShoppingCart className="h-4 w-4 text-gold-400" />}
            >
              {ui("addToCart")}
            </Button>
          )}
          {showBuyNow && buyNowButton}
        </div>
      </div>
      {hintId && (
        <p id={hintId} role="status" className="sr-only">
          {hint}
        </p>
      )}
    </>
  );
}
