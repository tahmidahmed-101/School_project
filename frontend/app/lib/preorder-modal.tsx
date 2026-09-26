"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import type { Product } from "./types";
import { useCart } from "./cart";

interface PreOrderModalContextType {
  isOpen: boolean;
  product: Product | null;
  quantity: number;
  selectedVariant?: Record<string, string>;
  openPreOrderModal: (
    product: Product,
    quantity?: number,
    selectedVariant?: Record<string, string>,
  ) => void;
  closePreOrderModal: () => void;
  confirmPreOrder: () => void;
}

const PreOrderModalContext = createContext<PreOrderModalContextType | null>(null);

export function PreOrderModalProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariant, setSelectedVariant] = useState<Record<string, string> | undefined>(undefined);

  const { addItem, openDrawer } = useCart();

  const openPreOrderModal = useCallback(
    (prod: Product, qty: number = 1, variant?: Record<string, string>) => {
      setProduct(prod);
      setQuantity(qty);
      setSelectedVariant(variant);
      setIsOpen(true);
    },
    [],
  );

  const closePreOrderModal = useCallback(() => {
    setIsOpen(false);
    setProduct(null);
  }, []);

  const confirmPreOrder = useCallback(() => {
    if (product) {
      addItem(product, quantity, selectedVariant);
      setIsOpen(false);
      setProduct(null);
      // Open the existing cart drawer so user sees their pre-order item immediately
      openDrawer();
    }
  }, [product, quantity, selectedVariant, addItem, openDrawer]);

  return (
    <PreOrderModalContext.Provider
      value={{
        isOpen,
        product,
        quantity,
        selectedVariant,
        openPreOrderModal,
        closePreOrderModal,
        confirmPreOrder,
      }}
    >
      {children}
    </PreOrderModalContext.Provider>
  );
}

export function usePreOrderModal(): PreOrderModalContextType {
  const context = useContext(PreOrderModalContext);
  if (!context) {
    throw new Error("usePreOrderModal must be used within a PreOrderModalProvider");
  }
  return context;
}
