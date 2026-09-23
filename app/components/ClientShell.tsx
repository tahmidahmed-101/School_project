"use client";

import { useState } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { CartDrawer } from "./CartDrawer";
import { WishlistDrawer } from "./WishlistDrawer";
import { MobileBottomBar } from "./MobileBottomBar";
import { MobileNavMenu } from "./MobileNavMenu";
import { PreOrderModalProvider } from "../lib/preorder-modal";
import { PreOrderConfirmationModal } from "./PreOrderConfirmationModal";

interface ClientShellProps {
  children: React.ReactNode;
}

export function ClientShell({ children }: ClientShellProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <PreOrderModalProvider>
      <div className="ts-root flex min-h-screen flex-col">
        <Navbar onOpenMenu={() => setIsMenuOpen(true)} />
        <main className="flex-1 pb-28 lg:pb-0">{children}</main>
        <Footer />
        <CartDrawer />
        <WishlistDrawer />
        <MobileNavMenu open={isMenuOpen} onClose={() => setIsMenuOpen(false)} />
        <MobileBottomBar />
        <PreOrderConfirmationModal />
      </div>
    </PreOrderModalProvider>
  );
}
