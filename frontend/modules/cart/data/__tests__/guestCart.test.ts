import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestOptions } from "@/lib/api/client";

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  apiRequest: (path: string, options?: RequestOptions) => apiRequest(path, options),
}));

const { ApiError } = await import("@/lib/api/client");

/** The module keeps the token and last-seen lines in module state, so each test loads a fresh copy. */
async function load() {
  vi.resetModules();
  return import("../guestCart");
}

const cart = (lines: { id: string; variant_id: string; quantity: number }[]) => ({ id: "c-1", lines });
const calls = () => apiRequest.mock.calls.map(([path, options]) => `${options?.method ?? "GET"} ${path}`);

beforeEach(() => {
  apiRequest.mockReset();
});

describe("syncGuestCart", () => {
  it("creates no cart while the browser cart is empty", async () => {
    const { syncGuestCart } = await load();
    expect(await syncGuestCart([])).toBe(true);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("creates the cart on the first add and sends the token with every line call", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 2 }]));
    const { syncGuestCart } = await load();

    expect(await syncGuestCart([{ variantId: "v-1", quantity: 2 }])).toBe(true);
    expect(calls()).toEqual(["POST /cart/", "POST /cart/lines/"]);
    expect(apiRequest.mock.calls[1][1]).toMatchObject({
      body: { variant_id: "v-1", quantity: 2 },
      headers: { "X-Guest-Cart-Token": "tok" },
    });
  });

  it("only sends what changed on later syncs", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 2 }]))
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 5 }]))
      .mockResolvedValueOnce(cart([]));
    const { syncGuestCart } = await load();

    await syncGuestCart([{ variantId: "v-1", quantity: 2 }]);
    await syncGuestCart([{ variantId: "v-1", quantity: 5 }]);
    await syncGuestCart([]);
    expect(calls().slice(2)).toEqual(["PATCH /cart/lines/l-1/", "DELETE /cart/lines/l-1/"]);
  });

  it("reports out of sync, without throwing, when the backend is unreachable", async () => {
    apiRequest.mockRejectedValue(new ApiError({ status: 0, code: "network_error", message: "down", isNetwork: true }));
    const { syncGuestCart } = await load();
    expect(await syncGuestCart([{ variantId: "v-1", quantity: 1 }])).toBe(false);
  });

  it("keeps syncing the other lines when the backend refuses one", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockRejectedValueOnce(new ApiError({ status: 400, code: "preorder_not_active", message: "closed" }))
      .mockResolvedValueOnce(cart([{ id: "l-2", variant_id: "v-2", quantity: 1 }]));
    const { syncGuestCart } = await load();

    const inSync = await syncGuestCart([
      { variantId: "v-1", quantity: 1 },
      { variantId: "v-2", quantity: 1 },
    ]);
    expect(inSync).toBe(false);
    expect(calls()).toEqual(["POST /cart/", "POST /cart/lines/", "POST /cart/lines/"]);
  });

  it("says why the backend refused a line, and forgets it once a sync goes through", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockRejectedValueOnce(new ApiError({ status: 409, code: "mixed_basket", message: "separate" }))
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]));
    const { MIXED_BASKET_CODE, cartRefusalCode, syncGuestCart } = await load();

    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);
    expect(cartRefusalCode()).toBe(MIXED_BASKET_CODE);

    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);
    expect(cartRefusalCode()).toBeNull();
  });
});

describe("syncedGuestCartToken", () => {
  it("re-reads the server cart and returns the token once it matches", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]))
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]));
    const { syncGuestCart, syncedGuestCartToken } = await load();
    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);

    const items = [{ product: {} as never, quantity: 1, variantId: "v-1" }];
    expect(await syncedGuestCartToken(items)).toBe("tok");
    expect(calls()).toEqual(["POST /cart/", "POST /cart/lines/", "GET /cart/"]);
  });

  it("returns null when the cart could not be confirmed, and starts a new cart after the old one is gone", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "old", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]))
      // The cart was checked out elsewhere: the token no longer opens it.
      .mockRejectedValueOnce(new ApiError({ status: 404, code: "guest_cart_not_found", message: "Cart not found." }))
      .mockResolvedValueOnce({ token: "new", cart: cart([]) })
      .mockRejectedValueOnce(new ApiError({ status: 0, code: "network_error", message: "down", isNetwork: true }));
    const { syncGuestCart, syncedGuestCartToken } = await load();
    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);

    const items = [{ product: {} as never, quantity: 1, variantId: "v-1" }];
    expect(await syncedGuestCartToken(items)).toBeNull();
    expect(calls().slice(2)).toEqual(["GET /cart/", "POST /cart/", "POST /cart/lines/"]);
  });
});

describe("logged-in customer", () => {
  const customer = vi.fn();
  const customerCalls = () => customer.mock.calls.map(([path, options]) => `${options?.method ?? "GET"} ${path}`);

  beforeEach(() => {
    customer.mockReset();
  });

  it("mirrors the cart to the customer's own cart, not a guest cart", async () => {
    customer
      .mockResolvedValueOnce(cart([]))
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 2 }]));
    const { setCartCustomer, syncGuestCart } = await load();
    setCartCustomer(customer);

    expect(await syncGuestCart([{ variantId: "v-1", quantity: 2 }])).toBe(true);
    expect(customerCalls()).toEqual(["GET /orders/cart/", "POST /orders/cart/lines/"]);
    expect(customer.mock.calls[1][1]).toMatchObject({ body: { variant_id: "v-1", quantity: 2 } });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("empties and forgets the guest cart the shopper had before logging in", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "g-1", variant_id: "v-1", quantity: 1 }]))
      // After login: the guest cart is read and its line removed.
      .mockResolvedValueOnce(cart([{ id: "g-1", variant_id: "v-1", quantity: 1 }]))
      .mockResolvedValueOnce(cart([]));
    customer
      .mockResolvedValueOnce(cart([]))
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]));
    const { setCartCustomer, syncGuestCart } = await load();
    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);

    setCartCustomer(customer);
    expect(await syncGuestCart([{ variantId: "v-1", quantity: 1 }])).toBe(true);

    expect(calls().slice(2)).toEqual(["GET /cart/", "DELETE /cart/lines/g-1/"]);
    expect(customerCalls()).toEqual(["GET /orders/cart/", "POST /orders/cart/lines/"]);

    // The guest token is gone: a later sync touches only the customer's cart.
    customer.mockResolvedValueOnce(cart([]));
    await syncGuestCart([]);
    expect(calls()).toHaveLength(4);
    expect(customerCalls().at(-1)).toBe("DELETE /orders/cart/lines/l-1/");
  });

  it("has no guest cart token to check out, so checkout sends the item list", async () => {
    const { setCartCustomer, syncedGuestCartToken } = await load();
    setCartCustomer(customer);

    const items = [{ product: {} as never, quantity: 1, variantId: "v-1" }];
    expect(await syncedGuestCartToken(items)).toBeNull();
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("goes back to a guest cart after logout", async () => {
    customer.mockResolvedValueOnce(cart([]));
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "g-1", variant_id: "v-1", quantity: 1 }]));
    const { setCartCustomer, syncGuestCart } = await load();
    setCartCustomer(customer);
    await syncGuestCart([]);

    setCartCustomer(null);
    expect(await syncGuestCart([{ variantId: "v-1", quantity: 1 }])).toBe(true);
    expect(calls()).toEqual(["POST /cart/", "POST /cart/lines/"]);
  });
});

describe("saveCartContact", () => {
  it("does nothing for a guest who has no server cart yet", async () => {
    const { saveCartContact } = await load();
    await saveCartContact({ phone: "01711223344", name: "Rahim" });
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it("sends the name and phone to the guest's own cart", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]))
      .mockResolvedValueOnce({ contact_phone: "01711223344", contact_name: "Rahim" });
    const { saveCartContact, syncGuestCart, GUEST_CART_TOKEN_HEADER } = await load();
    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);

    await saveCartContact({ phone: "01711223344", name: "Rahim" });

    expect(calls().at(-1)).toBe("PATCH /cart/contact/");
    expect(apiRequest.mock.calls.at(-1)?.[1]).toMatchObject({
      body: { phone: "01711223344", name: "Rahim" },
      headers: { [GUEST_CART_TOKEN_HEADER]: "tok" },
    });
  });

  it("never throws when the backend refuses", async () => {
    apiRequest
      .mockResolvedValueOnce({ token: "tok", cart: cart([]) })
      .mockResolvedValueOnce(cart([{ id: "l-1", variant_id: "v-1", quantity: 1 }]))
      .mockRejectedValueOnce(new ApiError({ status: 400, code: "invalid_phone", message: "bad" }));
    const { saveCartContact, syncGuestCart } = await load();
    await syncGuestCart([{ variantId: "v-1", quantity: 1 }]);

    await expect(saveCartContact({ phone: "01711223344", name: "" })).resolves.toBeUndefined();
  });
});
