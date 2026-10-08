"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CartItem, Product } from "@/lib/types";
import { getMaxOrderQuantity, productKind, type ProductKind } from "@/lib/product";
import { usePersistedState } from "@/lib/usePersistedState";
import { ORDER_QUANTITY_CAP, applyVariant, resolveVariant, selectionFor } from "@/lib/variants";
import { useAuth } from "@/modules/auth";
import { MIXED_BASKET_CODE, cartRefusalCode, setCartCustomer, syncGuestCart } from "./data/guestCart";
import { acceptsProduct, basketGroups, basketKind, itemCountByKind, type BasketGroup } from "./domain/kind";
import { toCartTargets } from "./domain/sync";

interface CartContextType {
  items: CartItem[];
  /** Adds the SKU that `selectedVariant` points at (the product's default SKU when omitted). */
  /** Adds a line and opens the cart drawer; pass `openDrawer: false` when the caller navigates away instead. */
  addItem: (
    product: Product,
    quantity?: number,
    selectedVariant?: Record<string, string>,
    options?: { openDrawer?: boolean },
  ) => boolean;
  updateQuantity: (productId: string, quantity: number, selectedVariant?: Record<string, string>) => void;
  removeItem: (productId: string, selectedVariant?: Record<string, string>) => void;
  clearCart: () => void;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  itemCountByKind: Record<ProductKind, number>;
  /** Sum of the SKU prices in the cart. An estimate: the backend prices the order at checkout. */
  subtotal: number;
  kind: ProductKind | "mixed" | null;
  /** One entry per kind held; more than one only for a cart saved before kinds were kept apart. */
  groups: BasketGroup[];
  /** Kind of the product the last `addItem` turned away because the cart holds the other kind. */
  refusedKind: ProductKind | null;
  /** The server would not take a line because its copy of the cart holds the other kind. */
  serverRefusedMixed: boolean;
}

const CartContext = createContext<CartContextType | null>(null);

/**
 * v2: lines carry the backend variant id. The v1 key ("kullmart:cart") held mock-catalogue products that do not
 * exist in the API and could never be ordered, so it is discarded rather than migrated.
 */
const CART_KEY = "kullmart:cart:v2";
const LEGACY_CART_KEY = "kullmart:cart";
/** Quiet time after the last cart change before it is mirrored to the backend, so a run of +/- taps is one sync. */
const SYNC_DELAY_MS = 600;

function variantMatches(a?: Record<string, string>, b?: Record<string, string>): boolean {
  const keysA = Object.keys(a ?? {});
  const keysB = Object.keys(b ?? {});
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => a?.[k] === b?.[k]);
}

/** One line never holds more than the product page lets a shopper pick (stock, or the pre-order limit). */
const lineCap = (product: Product) => Math.max(1, Math.min(ORDER_QUANTITY_CAP, getMaxOrderQuantity(product)));

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
  const [storedItems, setStoredItems, isHydrated] = usePersistedState<unknown>(CART_KEY, []);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [refusedKind, setRefusedKind] = useState<ProductKind | null>(null);
  const [serverRefusedMixed, setServerRefusedMixed] = useState(false);

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

  // Mirror the cart to the backend: the customer's own cart when logged in (so the store sees whose it is), an
  // anonymous guest cart otherwise. Not before the saved cart has loaded (the empty first render would wipe the
  // server copy), and not before the session is known (a logged-in customer would briefly get a guest cart).
  const { status: authStatus, user, authRequest } = useAuth();
  const asCustomer = authStatus === "authenticated" && user?.role === "customer";
  useEffect(() => {
    if (!isHydrated || authStatus === "loading") return;
    setCartCustomer(asCustomer ? authRequest : null);
    let stale = false;
    const timer = setTimeout(
      () =>
        void syncGuestCart(toCartTargets(items)).then(() => {
          if (!stale) setServerRefusedMixed(cartRefusalCode() === MIXED_BASKET_CODE);
        }),
      SYNC_DELAY_MS,
    );
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [items, isHydrated, authStatus, asCustomer, authRequest]);

  const addItem = useCallback(
    (
      product: Product,
      quantity = 1,
      selectedVariant?: Record<string, string>,
      { openDrawer = true }: { openDrawer?: boolean } = {},
    ) => {
      const variant = resolveVariant(product, selectedVariant);
      // No SKU means the product did not come from the API (e.g. an old wishlist entry): it cannot be ordered.
      if (!variant || !variant.inStock) return false;

      const line = toCartProduct(applyVariant(product, variant));
      const selection = selectionFor(variant);

      if (!acceptsProduct(items, line)) {
        setRefusedKind(productKind(line));
        setIsDrawerOpen(true);
        return false;
      }
      setRefusedKind(null);

      setItems((prev) => {
        // Several adds in one tick (move all to cart) each see the same `items`, so the rule is applied here too.
        if (!acceptsProduct(prev, line)) return prev;
        const existingIdx = prev.findIndex((item) => item.variantId === variant.id);
        if (existingIdx > -1) {
          const updated = [...prev];
          const existing = updated[existingIdx]!;
          updated[existingIdx] = {
            ...existing,
            product: line,
            quantity: Math.min(lineCap(line), existing.quantity + quantity),
          };
          return updated;
        }
        return [
          ...prev,
          {
            product: line,
            quantity: Math.min(lineCap(line), quantity),
            selectedVariant: Object.keys(selection).length ? selection : undefined,
            variantId: variant.id,
          },
        ];
      });

      if (openDrawer) setIsDrawerOpen(true);
      return true;
    },
    [items, setItems],
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
            ? { ...item, quantity: Math.min(lineCap(item.product), quantity) }
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
  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setRefusedKind(null);
  }, []);
  const toggleDrawer = useCallback(() => setIsDrawerOpen((prev) => !prev), []);

  const countByKind = useMemo(() => itemCountByKind(items), [items]);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [items]);
  const kind = useMemo(() => basketKind(items), [items]);
  const groups = useMemo(() => basketGroups(items), [items]);

  const value = useMemo(
    () => ({
      items,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      itemCountByKind: countByKind,
      subtotal,
      kind,
      groups,
      refusedKind,
      serverRefusedMixed,
    }),
    [
      items,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
      isDrawerOpen,
      openDrawer,
      closeDrawer,
      toggleDrawer,
      countByKind,
      subtotal,
      kind,
      groups,
      refusedKind,
      serverRefusedMixed,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextType {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }
  return ctx;
}
