"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { productKind, splitByKind, type ProductKind } from "@/lib/product";
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
  countByKind: Record<ProductKind, number>;
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

  const countByKind = useMemo(() => {
    const byKind = splitByKind(items, productKind);
    return { stock: byKind.stock.length, preorder: byKind.preorder.length };
  }, [items]);

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
      countByKind,
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
      countByKind,
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
