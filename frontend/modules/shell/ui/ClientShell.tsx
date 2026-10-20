"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLazyMount } from "@/design-system/patterns/useLazyMount";
import { Navbar } from "./Navbar";
import { CartDrawer } from "@/modules/cart";
import { useBrand } from "@/modules/catalog";
import { WishlistDrawer } from "@/modules/wishlist";
import { MobileBottomBar } from "./MobileBottomBar";
import { FloatingContact } from "./FloatingContact";
import { PreOrderModalProvider } from "@/modules/preorder";
import { PreOrderConfirmationModal } from "@/modules/preorder";

// Closed until the menu button is tapped, so it loads as its own chunk after the page (see useLazyMount).
const MobileNavMenu = dynamic(() => import("./MobileNavMenu").then((m) => m.MobileNavMenu), { ssr: false });

interface ClientShellProps {
  /** Rendered on the server and handed in; only its shop-aware link columns run on the client. */
  footer: React.ReactNode;
  /** Whether the mobile menu links to /shipping-policy (only once that policy is published). */
  hasShippingPolicy?: boolean;
  children: React.ReactNode;
}

export function ClientShell({ footer, hasShippingPolicy = false, children }: ClientShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuReady = useLazyMount(isMenuOpen);
  const { freeDeliveryMinAmount } = useBrand();

  return (
    <PreOrderModalProvider>
      <div className="ts-root flex min-h-screen flex-col">
        <Navbar onOpenMenu={() => setIsMenuOpen(true)} />
        <main className="flex-1 pb-28 lg:pb-0">{children}</main>
        {footer}
        <CartDrawer freeDeliveryMinAmount={freeDeliveryMinAmount} />
        <WishlistDrawer />
        {menuReady && (
          <MobileNavMenu open={isMenuOpen} onClose={() => setIsMenuOpen(false)} hasShippingPolicy={hasShippingPolicy} />
        )}
        <MobileBottomBar />
        <FloatingContact />
        <PreOrderConfirmationModal />
      </div>
    </PreOrderModalProvider>
  );
}
