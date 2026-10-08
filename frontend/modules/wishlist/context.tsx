"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { Product } from "@/lib/types";
import { usePersistedState } from "@/lib/usePersistedState";

interface WishlistContextType {
  items: Product[];
  addItem: (product: Product) => void;
  removeItem: (productId: string) => void;
  toggleItem: (product: Product) => void;
  isInWishlist: (productId: string) => boolean;
  clearWishlist: () => void;
  isWishlistOpen: boolean;
  openWishlist: () => void;
  closeWishlist: () => void;
  toggleWishlist: () => void;
  totalWishlistItems: number;
}

const WishlistContext = createContext<WishlistContextType | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = usePersistedState<Product[]>("kullmart:wishlist", []);
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);

  const addItem = useCallback(
    (product: Product) => {
      setItems((prev) => {
        if (prev.some((p) => p.id === product.id)) return prev;
        return [...prev, product];
      });
    },
    [setItems],
  );

  const removeItem = useCallback(
    (productId: string) => {
      setItems((prev) => prev.filter((p) => p.id !== productId));
    },
    [setItems],
  );

  const toggleItem = useCallback(
    (product: Product) => {
      setItems((prev) => {
        const exists = prev.some((p) => p.id === product.id);
        if (exists) {
          return prev.filter((p) => p.id !== product.id);
        }
        return [...prev, product];
      });
    },
    [setItems],
  );

  const isInWishlist = useCallback(
    (productId: string) => {
      return items.some((p) => p.id === productId);
    },
    [items],
  );

  const clearWishlist = useCallback(() => {
    setItems([]);
  }, [setItems]);

  const openWishlist = useCallback(() => setIsWishlistOpen(true), []);
  const closeWishlist = useCallback(() => setIsWishlistOpen(false), []);
  const toggleWishlist = useCallback(() => setIsWishlistOpen((prev) => !prev), []);

  const value = useMemo(
    () => ({
      items,
      addItem,
      removeItem,
      toggleItem,
      isInWishlist,
      clearWishlist,
      isWishlistOpen,
      openWishlist,
      closeWishlist,
      toggleWishlist,
      totalWishlistItems: items.length,
    }),
    [
      items,
      addItem,
      removeItem,
      toggleItem,
      isInWishlist,
      clearWishlist,
      isWishlistOpen,
      openWishlist,
      closeWishlist,
      toggleWishlist,
    ],
  );

  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist(): WishlistContextType {
  const ctx = useContext(WishlistContext);
  if (!ctx) {
    throw new Error("useWishlist must be used within WishlistProvider");
  }
  return ctx;
}
