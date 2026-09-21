"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CartItem, Product } from "./types";
import { usePersistedState } from "./usePersistedState";

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number, selectedVariant?: Record<string, string>) => void;
  updateQuantity: (
    productId: string,
    quantity: number,
    selectedVariant?: Record<string, string>,
  ) => void;
  removeItem: (productId: string, selectedVariant?: Record<string, string>) => void;
  clearCart: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  totalItems: number;
  subtotal: number;
  freeDeliveryThreshold: number;
  isFreeDelivery: boolean;
  freeDeliveryRemaining: number;
}

const CartContext = createContext<CartContextType | null>(null);

const FREE_DELIVERY_THRESHOLD = 2000;

function variantMatches(a?: Record<string, string>, b?: Record<string, string>): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a[k] === b[k]);
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = usePersistedState<CartItem[]>("kullmart:cart", []);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const addItem = useCallback(
    (product: Product, quantity = 1, selectedVariant?: Record<string, string>) => {
      setItems((prev) => {
        const existingIdx = prev.findIndex(
          (item) =>
            item.product.id === product.id && variantMatches(item.selectedVariant, selectedVariant),
        );

        if (existingIdx > -1) {
          const updated = [...prev];
          const existing = updated[existingIdx]!;
          updated[existingIdx] = {
            ...existing,
            quantity: Math.min(product.stockCount, existing.quantity + quantity),
          };
          return updated;
        }

        return [...prev, { product, quantity, selectedVariant }];
      });

      setIsDrawerOpen(true);
    },
    [setItems],
  );

  const removeItem = useCallback((productId: string, selectedVariant?: Record<string, string>) => {
    setItems((prev) =>
      prev.filter(
        (item) =>
          !(item.product.id === productId && variantMatches(item.selectedVariant, selectedVariant)),
      ),
    );
  }, [setItems]);

  const updateQuantity = useCallback(
    (productId: string, quantity: number, selectedVariant?: Record<string, string>) => {
      if (quantity <= 0) {
        removeItem(productId, selectedVariant);
        return;
      }

      setItems((prev) =>
        prev.map((item) => {
          if (
            item.product.id === productId &&
            variantMatches(item.selectedVariant, selectedVariant)
          ) {
            return {
              ...item,
              quantity: Math.min(item.product.stockCount, quantity),
            };
          }
          return item;
        }),
      );
    },
    [removeItem, setItems],
  );

  const clearCart = useCallback(() => {
    setItems([]);
  }, [setItems]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [items],
  );

  const isFreeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD;
  const freeDeliveryRemaining = Math.max(0, FREE_DELIVERY_THRESHOLD - subtotal);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        isDrawerOpen,
        openDrawer,
        closeDrawer,
        toggleDrawer,
        totalItems,
        subtotal,
        freeDeliveryThreshold: FREE_DELIVERY_THRESHOLD,
        isFreeDelivery,
        freeDeliveryRemaining,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
