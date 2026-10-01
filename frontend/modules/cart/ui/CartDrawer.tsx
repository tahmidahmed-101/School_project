"use client";

import Link from "next/link";
import { ShoppingCart, ArrowRight, Info } from "lucide-react";
import { useCart } from "../context";
import { useLang } from "@/lib/i18n";
import { CartItemRow } from "./CartItemRow";
import { Drawer, DrawerBody, DrawerEmpty, DrawerFooter } from "@/design-system/ui/Drawer";
import { buttonClass } from "@/design-system/ui/Button";

export function CartDrawer() {
  const { items, isDrawerOpen, closeDrawer, subtotal, totalItems } = useCart();
  const { ui, money, n } = useLang();

  const hasMixed = items.some((i) => i.product.isPreOrder) && items.some((i) => !i.product.isPreOrder);

  return (
    <Drawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      label={ui("cartTitle")}
      closeLabel="Close cart drawer"
      icon={<ShoppingCart className="h-5 w-5 text-gold-600" />}
      title={
        <>
          {ui("cartTitle")} ({n(totalItems)})
        </>
      }
    >
      <DrawerBody>
        {hasMixed && (
          <div className="shadow-2xs flex items-start gap-2.5 rounded-xl border border-gold-300 bg-gold-50 p-3 text-[11px] leading-relaxed text-gold-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
            <span>{ui("cartMixedNotice")}</span>
          </div>
        )}

        {items.length === 0 ? (
          <DrawerEmpty
            icon={<ShoppingCart className="h-8 w-8" />}
            title={ui("cartEmptyTitle")}
            subtitle={ui("cartEmptySubtitle")}
            actionLabel={ui("cartStartShopping")}
            onAction={closeDrawer}
          />
        ) : (
          items.map((item, idx) => (
            <CartItemRow key={`${item.product.id}-${idx}`} item={item} onNavigate={closeDrawer} />
          ))
        )}
      </DrawerBody>

      {items.length > 0 && (
        <DrawerFooter backLabel={ui("backToShopping")} onBack={closeDrawer}>
          <div className="flex items-center justify-between text-xs text-ink-700">
            <span>{ui("cartSubtotal")}</span>
            <span className="text-sm font-bold text-ink-900">{money(subtotal)}</span>
          </div>

          <Link href="/checkout" onClick={closeDrawer} className={buttonClass({ size: "lg", fullWidth: true })}>
            <span>{ui("cartProceedToCheckout")}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </DrawerFooter>
      )}
    </Drawer>
  );
}
