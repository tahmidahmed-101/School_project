"use client";

import { Plus, Minus, ShoppingBag, Zap, Heart, Phone, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Product } from "../../lib/types";
import { BRAND_INFO } from "../../lib/data";
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
}

/** Quantity stepper, wishlist toggle, purchase buttons and the WhatsApp / call shortcuts. */
export function ProductActions({
  product,
  quantity,
  onQuantityChange,
  selectedVariants,
  isSoldOut,
}: ProductActionsProps) {
  const { t, ui, money, n } = useLang();
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

  const orderVerb = product.isPreOrder ? "pre-order" : "order";
  const whatsappMessage = `Hi Kull Mart, I want to ${orderVerb}: ${t(product.name)} (Qty: ${quantity}) - ${money(product.price)}${
    product.isPreOrder
      ? `. Expected delivery: ${product.expectedDelivery ? t(product.expectedDelivery) : "TBD"}`
      : ""
  }`;

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
        {product.isPreOrder ? (
          isSoldOut ? (
            <button
              type="button"
              disabled
              className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-ink-200 px-4 py-3.5 text-xs font-bold uppercase tracking-wider text-ink-400 sm:flex-1"
            >
              <span>{ui("preOrderUnavailable")}</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => openPreOrderModal(product, quantity, selectedVariants)}
                className={CTA_AMBER}
              >
                <Sparkles className="h-4 w-4 fill-current" />
                <span>{ui("preOrderNow")}</span>
              </button>
              {buyNowButton}
            </>
          )
        ) : (
          <>
            <button
              type="button"
              onClick={() => addItem(product, quantity, selectedVariants)}
              className={CTA_DARK}
            >
              <ShoppingBag className="h-4 w-4 text-gold-400" />
              <span>{ui("addToCart")}</span>
            </button>
            {buyNowButton}
          </>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
        <a
          href={`https://wa.me/${BRAND_INFO.whatsapp}?text=${encodeURIComponent(whatsappMessage)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shadow-xs flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 py-3 text-xs font-bold tracking-wide text-white transition-all hover:bg-[#20ba59] hover:shadow-md"
        >
          <WhatsAppIcon />
          <span className="truncate">
            {product.isPreOrder ? "Pre-order on WhatsApp" : "Order on WhatsApp"}
          </span>
        </a>

        <a
          href={`tel:${BRAND_INFO.phoneTel}`}
          className="shadow-xs flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-ink-200 bg-ink-50 px-4 py-3 text-xs font-bold tracking-wide text-ink-900 transition-all hover:border-ink-900 hover:bg-white hover:shadow-md"
        >
          <Phone className="h-4 w-4 flex-shrink-0 text-ink-700" />
          <span className="truncate">Call for Order</span>
        </a>
      </div>
    </>
  );
}

function WhatsAppIcon() {
  return (
    <svg className="h-4 w-4 flex-shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24m4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43s.17-.25.25-.42c.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.03 2.6c.13.17 1.77 2.7 4.29 3.78.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.07-.1-.23-.17-.48-.29" />
    </svg>
  );
}
