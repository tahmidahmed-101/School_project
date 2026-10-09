"use client";

import Link from "next/link";
import { Calendar } from "lucide-react";
import type { CartItem } from "@/lib/types";
import { useCart } from "../context";
import { useLang } from "@/lib/i18n";
import { PreOrderBadge } from "@/design-system/patterns/PreOrderBadge";
import { QuantityStepper } from "@/design-system/patterns/QuantityStepper";
import { DrawerItem, DrawerItemImage, DrawerRemoveButton } from "@/design-system/ui/Drawer";

export function CartItemRow({ item, onNavigate }: { item: CartItem; onNavigate: () => void }) {
  const { t, ui, money } = useLang();
  const { updateQuantity, removeItem } = useCart();
  const { product, quantity, variantTitle, variantId } = item;

  return (
    <DrawerItem>
      <DrawerItemImage src={product.image} alt={t(product.name)} />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-1">
          <Link
            href={`/product/${product.slug}`}
            onClick={onNavigate}
            className="block truncate text-xs font-bold text-fg transition-colors hover:text-gold-800"
          >
            {t(product.name)}
          </Link>
          {product.isPreOrder && (
            <PreOrderBadge status={product.preorderStatus || "available"} size="sm" className="shrink-0" />
          )}
        </div>

        {variantTitle && <div className="truncate text-2xs font-medium text-fg-subtle">{variantTitle}</div>}

        <div className="text-xs font-bold text-gold-800">{money(product.price)}</div>

        {product.isPreOrder && (
          <div className="space-y-1 rounded-xl border border-gold-200/80 bg-gold-50/70 p-2 text-2xs text-gold-900">
            <div className="flex items-center gap-1 font-semibold text-gold-800">
              <Calendar className="h-3 w-3 shrink-0 text-gold-700" />
              <span>
                {ui("expectedDelivery")}:{" "}
                {product.expectedDelivery ? t(product.expectedDelivery) : ui("deliveryDateTbc")}
              </span>
            </div>
            <p className="text-2xs text-fg-muted">{ui("cartPreOrderNotice")}</p>
          </div>
        )}

        <div className="flex items-center gap-2 pt-1">
          <QuantityStepper quantity={quantity} onChange={(next) => updateQuantity(variantId, next)} />

          <DrawerRemoveButton label={ui("cartRemove")} onClick={() => removeItem(variantId)} />
        </div>
      </div>
    </DrawerItem>
  );
}
