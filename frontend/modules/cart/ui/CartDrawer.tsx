"use client";

import Link from "next/link";
import { ShoppingCart, ArrowRight, Info } from "lucide-react";
import { useCart } from "../context";
import { useLang } from "@/lib/i18n";
import { CartItemRow } from "./CartItemRow";
import { Drawer, DrawerBody, DrawerEmpty, DrawerFooter } from "@/design-system/ui/Drawer";
import { buttonClass } from "@/design-system/ui/Button";

const GROUP_TITLE = { stock: "kindStockItems", preorder: "kindPreorderItems" } as const;
const REFUSED_NOTICE = { stock: "cartHoldsPreorder", preorder: "cartHoldsStock" } as const;

export function CartDrawer() {
  const { groups, kind, refusedKind, serverRefusedMixed, isDrawerOpen, closeDrawer } = useCart();
  const { ui, money, n } = useLang();

  const isMixed = kind === "mixed";
  const notice = refusedKind
    ? ui(REFUSED_NOTICE[refusedKind])
    : isMixed || serverRefusedMixed
      ? ui("cartMixedNotice")
      : null;
  const only = isMixed ? undefined : groups[0];

  return (
    <Drawer
      open={isDrawerOpen}
      onClose={closeDrawer}
      label={ui("cartTitle")}
      closeLabel="Close cart drawer"
      icon={<ShoppingCart className="h-5 w-5 text-gold-700" />}
      title={isMixed ? ui("cartTitle") : `${ui("cartTitle")} (${n(only?.totalItems ?? 0)})`}
    >
      <DrawerBody>
        {notice && (
          <div
            role="status"
            className="shadow-2xs flex items-start gap-2.5 rounded-xl border border-gold-300 bg-gold-50 p-3 text-2xs leading-relaxed text-gold-900"
          >
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold-700" />
            <span>{notice}</span>
          </div>
        )}

        {groups.length === 0 ? (
          <DrawerEmpty
            icon={<ShoppingCart className="h-8 w-8" />}
            title={ui("cartEmptyTitle")}
            subtitle={ui("cartEmptySubtitle")}
            actionLabel={ui("cartStartShopping")}
            onAction={closeDrawer}
          />
        ) : (
          groups.map((group) => (
            <section key={group.kind} className="space-y-3">
              {isMixed && (
                <h3 className="text-2xs font-bold uppercase tracking-wider text-fg-muted">
                  {ui(GROUP_TITLE[group.kind])} ({n(group.totalItems)})
                </h3>
              )}
              {group.items.map((item) => (
                <CartItemRow key={item.variantId} item={item} onNavigate={closeDrawer} />
              ))}
              {isMixed && (
                <div className="flex items-center justify-between text-xs text-ink-700">
                  <span>{ui("cartSubtotal")}</span>
                  <span className="text-sm font-bold text-fg">{money(group.subtotal)}</span>
                </div>
              )}
            </section>
          ))
        )}
      </DrawerBody>

      {only && (
        <DrawerFooter backLabel={ui("backToShopping")} onBack={closeDrawer}>
          <div className="flex items-center justify-between text-xs text-ink-700">
            <span>{ui("cartSubtotal")}</span>
            <span className="text-sm font-bold text-fg">{money(only.subtotal)}</span>
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
