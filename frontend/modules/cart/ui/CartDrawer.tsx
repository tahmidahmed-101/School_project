"use client";

import Link from "next/link";
import { ShoppingCart, ArrowRight } from "lucide-react";
import { useCart } from "../context";
import { useLang } from "@/lib/i18n";
import { freeDeliveryStatus } from "@/lib/free-delivery";
import { FreeDeliveryNote } from "@/design-system/patterns/FreeDeliveryNote";
import { CartItemRow } from "./CartItemRow";
import { Drawer, DrawerBody, DrawerEmpty, DrawerFooter } from "@/design-system/ui/Drawer";
import { buttonClass } from "@/design-system/ui/Button";

/** `freeDeliveryMinAmount` comes from the shell: the brand lives in the catalog module, which already imports this one. */
export function CartDrawer({ freeDeliveryMinAmount }: { freeDeliveryMinAmount?: string | null }) {
  const { items, totalItems, subtotal, isDrawerOpen, closeDrawer } = useCart();
  const { ui, money, n } = useLang();

  return (
    <Drawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      label={ui("cartTitle")}
      closeLabel="Close cart drawer"
      icon={<ShoppingCart className="h-5 w-5 text-gold-700" />}
      title={`${ui("cartTitle")} (${n(totalItems)})`}
    >
      <DrawerBody>
        {items.length === 0 ? (
          <DrawerEmpty
            icon={<ShoppingCart className="h-8 w-8" />}
            title={ui("cartEmptyTitle")}
            subtitle={ui("cartEmptySubtitle")}
            actionLabel={ui("cartStartShopping")}
            onAction={closeDrawer}
          />
        ) : (
          <section className="space-y-3">
            {items.map((item) => (
              <CartItemRow key={item.variantId} item={item} onNavigate={closeDrawer} />
            ))}
          </section>
        )}
      </DrawerBody>

      {items.length > 0 && (
        <DrawerFooter backLabel={ui("backToShopping")} onBack={closeDrawer}>
          <div className="flex items-center justify-between text-xs text-ink-700">
            <span>{ui("cartSubtotal")}</span>
            <span className="text-sm font-bold text-fg">{money(subtotal)}</span>
          </div>
          <FreeDeliveryNote status={freeDeliveryStatus(freeDeliveryMinAmount, items)} />

          <Link href="/checkout" onClick={closeDrawer} className={buttonClass({ size: "lg", fullWidth: true })}>
            <span>{ui("cartProceedToCheckout")}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </DrawerFooter>
      )}
    </Drawer>
  );
}
