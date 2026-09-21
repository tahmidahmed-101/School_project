"use client";

import { useState } from "react";
import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { CartDrawer } from "./CartDrawer";
import { WishlistDrawer } from "./WishlistDrawer";
import { QuickSearch } from "./QuickSearch";
import { MobileBottomBar } from "./MobileBottomBar";
import { PreOrderModalProvider } from "../lib/preorder-modal";
import { PreOrderConfirmationModal } from "./PreOrderConfirmationModal";

interface ClientShellProps {
  children: React.ReactNode;
}

export function ClientShell({ children }: ClientShellProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  return (
    <PreOrderModalProvider>
      <div className="ts-root flex min-h-screen flex-col">
        <Navbar />
        <main className="flex-1 pb-28 lg:pb-0">{children}</main>
        <Footer />
        <CartDrawer />
        <WishlistDrawer />
        <QuickSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
        <MobileBottomBar
          onOpenSearch={() => setIsSearchOpen(true)}
          isSearchOpen={isSearchOpen}
        />
        <PreOrderConfirmationModal />
      </div>
    </PreOrderModalProvider>
  );
}
