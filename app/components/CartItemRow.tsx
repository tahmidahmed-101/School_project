"use client";

import Link from "next/link";
import { Minus, Plus, Trash2, Calendar } from "lucide-react";
import type { CartItem } from "../lib/types";
import { useCart } from "../lib/cart";
import { useLang } from "../lib/i18n";
import { PreOrderBadge } from "./PreOrderBadge";
import { DrawerItemImage } from "./ui/Drawer";

export function CartItemRow({ item, onNavigate }: { item: CartItem; onNavigate: () => void }) {
  const { t, ui, money, n } = useLang();
  const { updateQuantity, removeItem } = useCart();
  const { product, quantity, selectedVariant } = item;

  return (
    <div className="flex items-start gap-3 rounded-xl border border-ink-200/80 bg-ink-50 p-3">
      <DrawerItemImage src={product.image} alt={t(product.name)} />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/product/${product.slug}`}
            onClick={onNavigate}
            className="block truncate text-xs font-bold text-ink-900 transition-colors hover:text-gold-600"
          >
            {t(product.name)}
          </Link>
          {product.isPreOrder && (
            <PreOrderBadge
              status={product.preorderStatus || "available"}
              size="sm"
              className="shrink-0"
            />
          )}
        </div>

        <div className="text-xs font-bold text-gold-600">{money(product.price)}</div>

        {product.isPreOrder && (
          <div className="space-y-1 rounded-md border border-gold-200/80 bg-gold-50/70 p-2 text-[10px] text-gold-900">
            <div className="flex items-center gap-1 font-semibold text-gold-800">
              <Calendar className="h-3 w-3 shrink-0 text-gold-600" />
              <span>
                {ui("expectedDelivery")}:{" "}
                {product.expectedDelivery ? t(product.expectedDelivery) : "TBD"}
              </span>
            </div>
            <p className="text-[10px] text-ink-600">{ui("cartPreOrderNotice")}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() => updateQuantity(product.id, quantity - 1, selectedVariant)}
              className="cursor-pointer p-1 text-ink-600 hover:text-ink-900"
              aria-label="Decrease quantity"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="min-w-[20px] px-2 text-center text-xs font-bold text-ink-900">
              {n(quantity)}
            </span>
            <button
              type="button"
              onClick={() => updateQuantity(product.id, quantity + 1, selectedVariant)}
              className="cursor-pointer p-1 text-ink-600 hover:text-ink-900"
              aria-label="Increase quantity"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => removeItem(product.id, selectedVariant)}
            className="ml-auto cursor-pointer p-1 text-ink-400 transition-colors hover:text-red-600"
            aria-label={ui("cartRemove")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
