import { ApiError, apiRequest } from "@/lib/api/client";
import type { ApiGuestCart, ApiGuestCartCreated } from "@/lib/api/types";
import type { CartItem } from "@/lib/types";
import { planCartSync, toCartTargets, type CartSyncOp, type CartTarget, type ServerCartLine } from "../domain/sync";

/**
 * Mirrors the browser cart to the backend, so the store can see carts that were never checked out: to the
 * anonymous guest cart (/cart/) for a guest, and to the customer's own cart (/customer/orders/cart/) once they
 * are logged in, so the dashboard shows whose cart it is. The browser cart stays the source of truth for the UI:
 * a failed sync never blocks shopping, it is simply tried again on the next cart change, and checkout falls back
 * to sending the item list.
 */

/** `useAuth().authRequest`: a customer-API call as the logged-in customer. */
type CustomerRequest = <T>(
  path: string,
  options?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown; timeoutMs?: number },
) => Promise<T>;

/** Set while a customer is logged in; the cart is then mirrored to their account instead of a guest cart. */
let customerRequest: CustomerRequest | null = null;

/**
 * Switches the mirror between the guest cart (null) and the logged-in customer's cart. What this page last saw of
 * the server cart belonged to the other one, so it is read again on the next sync.
 */
export function setCartCustomer(request: CustomerRequest | null): void {
  if (request === customerRequest) return;
  customerRequest = request;
  lines = [];
  mustReload = true;
}

/** Header that addresses a guest cart. The token is never put in a URL. */
export const GUEST_CART_TOKEN_HEADER = "X-Guest-Cart-Token";

const TOKEN_KEY = "schoolproject:cart-token";
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

/** The same line edits against the customer's own cart. */
function sendAsCustomer(op: CartSyncOp, request: CustomerRequest): Promise<ApiGuestCart> {
  switch (op.type) {
    case "add":
      return request<ApiGuestCart>("/orders/cart/lines/", {
        method: "POST",
        body: { variant_id: op.variantId, quantity: op.quantity },
        timeoutMs: TIMEOUT_MS,
      });
    case "update":
      return request<ApiGuestCart>(`/orders/cart/lines/${op.lineId}/`, {
        method: "PATCH",
        body: { quantity: op.quantity },
        timeoutMs: TIMEOUT_MS,
      });
    case "remove":
      return request<ApiGuestCart>(`/orders/cart/lines/${op.lineId}/`, { method: "DELETE", timeoutMs: TIMEOUT_MS });
  }
}

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

/**
 * Empties and forgets the guest cart this browser was using, once its owner has logged in: the items now live in
 * their own cart, and an abandoned guest copy would sit in the dashboard as a second, anonymous cart.
 * Best effort: if the backend cannot be reached the token is kept and this is tried again on the next sync.
 */
async function retireGuestCart(): Promise<void> {
  const token = readToken();
  if (!token) return;
  try {
    const cart = await apiRequest<ApiGuestCart>("/cart/", { headers: withToken(token), timeoutMs: TIMEOUT_MS });
    for (const line of cart.lines) {
      await send({ type: "remove", lineId: line.id }, token);
    }
  } catch (error) {
    if (!(error instanceof ApiError) || error.isNetwork) return;
    // Already gone, or a line the backend would not remove: nothing more this browser can do with it.
  }
  writeToken(null);
}

/** One pass against the logged-in customer's cart. */
async function reconcileAsCustomer(want: CartTarget[], request: CustomerRequest): Promise<boolean> {
  await retireGuestCart();
  if (mustReload) {
    lines = toLines(await request<ApiGuestCart>("/orders/cart/", { timeoutMs: TIMEOUT_MS }));
    mustReload = false;
  }
  let inSync = true;
  for (const op of planCartSync(want, lines)) {
    try {
      lines = toLines(await sendAsCustomer(op, request));
    } catch (error) {
      if (!(error instanceof ApiError) || error.isNetwork) throw error;
      if (error.isNotFound || error.status === 401) {
        // The line is not what we last saw, or the session ended: look again next time.
        mustReload = true;
        throw error;
      }
      // The backend refused this line (e.g. it is no longer sold). The rest of the cart still syncs.
      inSync = false;
    }
  }
  return inSync;
}

/** One pass: makes the server cart hold `want`. True when it does; throws when the backend could not be reached. */
async function reconcile(want: CartTarget[]): Promise<boolean> {
  if (customerRequest) return reconcileAsCustomer(want, customerRequest);
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
      // The backend refused this line (e.g. it is no longer sold). The rest of the cart still syncs.
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
  // A logged-in customer has no guest cart to check out: the order is placed from the item list on their account,
  // and their saved cart empties when the browser cart is cleared after the order.
  if (customerRequest) return null;
  const inSync = await syncGuestCart(toCartTargets(items), { fresh: true });
  return inSync ? readToken() : null;
}

/**
 * Saves what the shopper has typed at checkout on their open server cart, so the store can call back someone who
 * leaves before placing the order. Best effort and silent: checkout sends the same details again with the order.
 */
export async function saveCartContact(contact: { phone: string; name: string }): Promise<void> {
  try {
    if (customerRequest) {
      await customerRequest("/orders/cart/contact/", { method: "PATCH", body: contact, timeoutMs: TIMEOUT_MS });
      return;
    }
    const token = readToken();
    if (!token) return;
    await apiRequest("/cart/contact/", {
      method: "PATCH",
      body: contact,
      headers: withToken(token),
      timeoutMs: TIMEOUT_MS,
    });
  } catch {
    return;
  }
}

/** Drops the token once its cart has become an order; the next add-to-cart starts a new cart. */
export function forgetGuestCart(): void {
  writeToken(null);
  lines = [];
  mustReload = true;
}
