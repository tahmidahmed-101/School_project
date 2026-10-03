"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "@/lib/types";
import { usePersistedState } from "@/lib/usePersistedState";
import { ORDER_QUANTITY_CAP, applyVariant, resolveVariant, selectionFor } from "@/lib/variants";

interface CartContextType {
  items: CartItem[];
  /** Adds the SKU that `selectedVariant` points at (the product's default SKU when omitted). */
  /** Adds a line and opens the cart drawer; pass `openDrawer: false` when the caller navigates away instead. */
  addItem: (
    product: Product,
    quantity?: number,
    selectedVariant?: Record<string, string>,
    options?: { openDrawer?: boolean },
  ) => void;
  updateQuantity: (productId: string, quantity: number, selectedVariant?: Record<string, string>) => void;
  removeItem: (productId: string, selectedVariant?: Record<string, string>) => void;
  clearCart: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  totalItems: number;
  /** Sum of the SKU prices in the cart. An estimate: the backend prices the order at checkout. */
  subtotal: number;
}

const CartContext = createContext<CartContextType | null>(null);

/**
 * v2: lines carry the backend variant id. The v1 key ("kullmart:cart") held mock-catalogue products that do not
 * exist in the API and could never be ordered, so it is discarded rather than migrated.
 */
const CART_KEY = "kullmart:cart:v2";
const LEGACY_CART_KEY = "kullmart:cart";

function variantMatches(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const keysA = Object.keys(a ?? {});
  const keysB = Object.keys(b ?? {});
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a?.[k] === b?.[k]);
}

/** Keeps the saved cart small and current: only what the drawer and checkout render, not the full SKU list. */
function toCartProduct(product: Product): Product {
  return {
    ...product,
    gallery: [product.image],
    description: { en: "", bn: "" },
    longDescription: { en: "", bn: "" },
    variants: undefined,
    skuVariants: undefined,
    specs: undefined,
    highlights: undefined,
  };
}

/** Anything in storage that is not a well-formed v2 line (hand-edited, from an older shape) is dropped, never thrown on. */
function sanitizeCart(raw: unknown): CartItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is CartItem => {
    if (!entry || typeof entry !== "object") return false;
    const item = entry as Partial<CartItem>;
    const product = item.product as Partial<Product> | undefined;
    return (
      typeof item.variantId === "string" &&
      item.variantId.length > 0 &&
      typeof item.quantity === "number" &&
      item.quantity > 0 &&
      !!product &&
      typeof product.id === "string" &&
      typeof product.slug === "string" &&
      typeof product.price === "number" &&
      typeof product.image === "string" &&
      !!product.name &&
      typeof product.name.en === "string"
    );
  });
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [storedItems, setStoredItems] = usePersistedState<unknown>(CART_KEY, []);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const items = useMemo(() => sanitizeCart(storedItems), [storedItems]);
  const setItems = useCallback(
    (update: (prev: CartItem[]) => CartItem[]) => setStoredItems((prev: unknown) => update(sanitizeCart(prev))),
    [setStoredItems],
  );

  useEffect(() => {
    try {
      window.localStorage.removeItem(LEGACY_CART_KEY);
    } catch {
      // Storage blocked: nothing to clean up.
    }
  }, []);

  const addItem = useCallback(
    (
      product: Product,
      quantity = 1,
      selectedVariant?: Record<string, string>,
      { openDrawer = true }: { openDrawer?: boolean } = {},
    ) => {
      const variant = resolveVariant(product, selectedVariant);
      // No SKU means the product did not come from the API (e.g. an old wishlist entry): it cannot be ordered.
      if (!variant || !variant.inStock) return;

      const line = toCartProduct(applyVariant(product, variant));
      const selection = selectionFor(variant);

      setItems((prev) => {
        const existingIdx = prev.findIndex((item) => item.variantId === variant.id);
        if (existingIdx > -1) {
          const updated = [...prev];
          const existing = updated[existingIdx]!;
          updated[existingIdx] = {
            ...existing,
            product: line,
            quantity: Math.min(ORDER_QUANTITY_CAP, existing.quantity + quantity),
          };
          return updated;
        }
        return [
          ...prev,
          {
            product: line,
            quantity: Math.min(ORDER_QUANTITY_CAP, quantity),
            selectedVariant: Object.keys(selection).length ? selection : undefined,
            variantId: variant.id,
          },
        ];
      });

      if (openDrawer) setIsDrawerOpen(true);
    },
    [setItems],
  );

  const removeItem = useCallback(
    (productId: string, selectedVariant?: Record<string, string>) => {
      setItems((prev) =>
        prev.filter(
          (item) => !(item.product.id === productId && variantMatches(item.selectedVariant, selectedVariant)),
        ),
      );
    },
    [setItems],
  );

  const updateQuantity = useCallback(
    (productId: string, quantity: number, selectedVariant?: Record<string, string>) => {
      if (quantity <= 0) {
        removeItem(productId, selectedVariant);
        return;
      }

      setItems((prev) =>
        prev.map((item) =>
          item.product.id === productId && variantMatches(item.selectedVariant, selectedVariant)
            ? { ...item, quantity: Math.min(item.product.stockCount || ORDER_QUANTITY_CAP, quantity) }
            : item,
        ),
      );
    },
    [removeItem, setItems],
  );

  const clearCart = useCallback(() => {
    setItems(() => []);
  }, [setItems]);

  const openDrawer = useCallback(() => setIsDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setIsDrawerOpen(false), []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const totalItems = useMemo(() => items.reduce((sum, item) => sum + item.quantity, 0), [items]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [items]);

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
