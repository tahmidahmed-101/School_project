"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useLazyMount } from "@/design-system/patterns/useLazyMount";
import { Navbar } from "./Navbar";
import { CartDrawer } from "@/modules/cart";
import { WishlistDrawer } from "@/modules/wishlist";
import { MobileBottomBar } from "./MobileBottomBar";
import { FloatingContact } from "./FloatingContact";
import { PreOrderModalProvider } from "@/modules/preorder";
import { PreOrderConfirmationModal } from "@/modules/preorder";

// Closed until the menu button is tapped, so it loads as its own chunk after the page (see useLazyMount).
const MobileNavMenu = dynamic(() => import("./MobileNavMenu").then((m) => m.MobileNavMenu), { ssr: false });

interface ClientShellProps {
  /** Rendered on the server and handed in, so the footer ships no JavaScript. */
  footer: React.ReactNode;
  children: React.ReactNode;
}

export function ClientShell({ footer, children }: ClientShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuReady = useLazyMount(isMenuOpen);

  return (
    <PreOrderModalProvider>
      <div className="ts-root flex min-h-screen flex-col">
        <Navbar onOpenMenu={() => setIsMenuOpen(true)} />
        <main className="flex-1 pb-28 lg:pb-0">{children}</main>
        {footer}
        <CartDrawer />
        <WishlistDrawer />
        {menuReady && <MobileNavMenu open={isMenuOpen} onClose={() => setIsMenuOpen(false)} />}
        <MobileBottomBar />
        <FloatingContact />
        <PreOrderConfirmationModal />
      </div>
    </PreOrderModalProvider>
  );
}
