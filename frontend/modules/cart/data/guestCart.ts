import { ApiError, apiRequest } from "@/lib/api/client";
import type { ApiGuestCart, ApiGuestCartCreated } from "@/lib/api/types";
import type { CartItem } from "@/lib/types";
import { planCartSync, toCartTargets, type CartSyncOp, type CartTarget, type ServerCartLine } from "../domain/sync";

/**
 * Mirrors the browser cart to the backend's guest cart (/cart/), so the store can see carts that were never
 * checked out. The browser cart stays the source of truth for the UI: a failed sync never blocks shopping, it is
 * simply tried again on the next cart change, and checkout falls back to sending the item list.
 */

/** Header that addresses a guest cart. The token is never put in a URL. */
export const GUEST_CART_TOKEN_HEADER = "X-Guest-Cart-Token";

const TOKEN_KEY = "kullmart:cart-token";
/** Cart calls run in the background and before checkout; a slow backend must not hold either up for long. */
const TIMEOUT_MS = 6_000;

/** Fallback for the session when storage is blocked. */
let memoryToken: string | null = null;

function readToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

function writeToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: the token lives in memory for this page.
  }
}

const withToken = (token: string) => ({ [GUEST_CART_TOKEN_HEADER]: token });

const toLines = (cart: ApiGuestCart): ServerCartLine[] =>
  cart.lines.map((line) => ({ id: line.id, variantId: line.variant_id, quantity: line.quantity }));

/** The token no longer opens a cart: it was checked out, or the backend never knew it. */
const isCartGone = (error: unknown) => error instanceof ApiError && error.code === "guest_cart_not_found";

function send(op: CartSyncOp, token: string): Promise<ApiGuestCart> {
  const headers = withToken(token);
  switch (op.type) {
    case "add":
      return apiRequest<ApiGuestCart>("/cart/lines/", {
        method: "POST",
        body: { variant_id: op.variantId, quantity: op.quantity },
        headers,
        timeoutMs: TIMEOUT_MS,
      });
    case "update":
      return apiRequest<ApiGuestCart>(`/cart/lines/${op.lineId}/`, {
        method: "PATCH",
        body: { quantity: op.quantity },
        headers,
        timeoutMs: TIMEOUT_MS,
      });
    case "remove":
      return apiRequest<ApiGuestCart>(`/cart/lines/${op.lineId}/`, {
        method: "DELETE",
        headers,
        timeoutMs: TIMEOUT_MS,
      });
  }
}

/** The server cart's lines as last seen; only trusted while `mustReload` is false. */
let lines: ServerCartLine[] = [];
let mustReload = true;
let target: CartTarget[] = [];
let pending = false;
let running: Promise<boolean> | null = null;

/** One pass: makes the server cart hold `want`. True when it does; throws when the backend could not be reached. */
async function reconcile(want: CartTarget[]): Promise<boolean> {
  let token = readToken();

  if (token && mustReload) {
    try {
      lines = toLines(await apiRequest<ApiGuestCart>("/cart/", { headers: withToken(token), timeoutMs: TIMEOUT_MS }));
      mustReload = false;
    } catch (error) {
      if (!isCartGone(error)) throw error;
      writeToken(null);
      token = null;
    }
  }

  if (!token) {
    // Nothing to store yet: a cart is only created on the first add-to-cart.
    if (want.length === 0) return true;
    const created = await apiRequest<ApiGuestCartCreated>("/cart/", { method: "POST", timeoutMs: TIMEOUT_MS });
    token = created.token;
    writeToken(token);
    lines = toLines(created.cart);
    mustReload = false;
  }

  let inSync = true;
  for (const op of planCartSync(want, lines)) {
    try {
      lines = toLines(await send(op, token));
    } catch (error) {
      if (!(error instanceof ApiError) || error.isNetwork) throw error;
      if (error.isNotFound) {
        // The cart or line is not what we last saw (checked out, edited in another tab): look again next time.
        mustReload = true;
        if (isCartGone(error)) writeToken(null);
        throw error;
      }
      // The backend refused this line (e.g. a pre-order that closed). The rest of the cart still syncs.
      inSync = false;
    }
  }
  return inSync;
}

async function drain(): Promise<boolean> {
  let inSync = false;
  while (pending) {
    pending = false;
    try {
      inSync = await reconcile(target);
    } catch {
      inSync = false;
    }
  }
  running = null;
  return inSync;
}

/**
 * Brings the server cart in line with `want`. Calls are serialised: a change made while a sync is in flight is
 * picked up by one more pass. Resolves true when the server cart holds exactly the latest `want`; never rejects.
 * `fresh` re-reads the server cart first instead of trusting what this page last saw.
 */
export function syncGuestCart(want: CartTarget[], { fresh = false }: { fresh?: boolean } = {}): Promise<boolean> {
  target = want;
  if (fresh) mustReload = true;
  pending = true;
  running ??= drain();
  return running;
}

/**
 * For checkout: the token of a server cart confirmed to hold exactly `items`, or null when that could not be
 * confirmed (backend unreachable, a line refused), in which case checkout sends the item list instead.
 */
export async function syncedGuestCartToken(items: CartItem[]): Promise<string | null> {
  if (items.length === 0) return null;
  const inSync = await syncGuestCart(toCartTargets(items), { fresh: true });
  return inSync ? readToken() : null;
}

/** Drops the token once its cart has become an order; the next add-to-cart starts a new cart. */
export function forgetGuestCart(): void {
  writeToken(null);
  lines = [];
  mustReload = true;
}
