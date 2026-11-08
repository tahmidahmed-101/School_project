"use client";

import Link from "next/link";
import type { CartItem } from "@/lib/types";
import { useCart } from "../context";
import { useLang } from "@/lib/i18n";
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
        </div>

        {variantTitle && <div className="truncate text-2xs font-medium text-fg-subtle">{variantTitle}</div>}

        <div className="text-xs font-bold text-gold-800">{money(product.price)}</div>

        <div className="flex items-center gap-2 pt-1">
          <QuantityStepper quantity={quantity} onChange={(next) => updateQuantity(variantId, next)} />

          <DrawerRemoveButton label={ui("cartRemove")} onClick={() => removeItem(variantId)} />
        </div>
      </div>
    </DrawerItem>
  );
}
