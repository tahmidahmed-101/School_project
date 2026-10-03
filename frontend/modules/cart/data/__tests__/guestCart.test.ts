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
