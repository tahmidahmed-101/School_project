"use client";

import Link from "next/link";
import { ShoppingBag, ArrowRight, ArrowLeft, Info } from "lucide-react";
import { useCart } from "../lib/cart";
import { useLang } from "../lib/i18n";
import { CartItemRow } from "./CartItemRow";
import { Drawer, DrawerBody, DrawerEmpty } from "./ui/Drawer";

export function CartDrawer() {
  const { items, isDrawerOpen, closeDrawer, subtotal, totalItems } = useCart();
  const { ui, money, n } = useLang();

  const hasMixed =
    items.some((i) => i.product.isPreOrder) && items.some((i) => !i.product.isPreOrder);

  return (
    <Drawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      label={ui("cartTitle")}
      closeLabel="Close cart drawer"
      icon={<ShoppingBag className="h-5 w-5 text-gold-500" />}
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
            icon={<ShoppingBag className="h-8 w-8" />}
            iconWrapClassName="bg-ink-100 text-ink-400"
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
        <div className="space-y-4 border-t border-ink-200 pt-4">
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-ink-700">
              <span>{ui("cartSubtotal")}</span>
              <span className="text-sm font-bold text-ink-900">{money(subtotal)}</span>
            </div>
          </div>

          <Link
            href="/checkout"
            onClick={closeDrawer}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gold-500 py-3 text-center text-xs font-bold text-ink-950 shadow-lg shadow-gold-500/25 transition-all hover:bg-gold-400"
          >
            <span>{ui("cartProceedToCheckout")}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>

          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={closeDrawer}
              className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-ink-500 transition-colors hover:text-gold-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{ui("backToShopping")}</span>
            </button>
          </div>
        </div>
      )}
    </Drawer>
  );
}
