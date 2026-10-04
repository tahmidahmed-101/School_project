import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestOptions } from "@/lib/api/client";
import type { ApiCheckoutRequest } from "@/lib/api/types";

const apiRequest = vi.fn();
vi.mock("@/lib/api/client", async (original) => ({
  ...(await original<typeof import("@/lib/api/client")>()),
  apiRequest: (path: string, options?: RequestOptions) => apiRequest(path, options),
}));
vi.mock("@/modules/cart", () => ({ GUEST_CART_TOKEN_HEADER: "X-Guest-Cart-Token" }));

const { ApiError } = await import("@/lib/api/client");
const { placeOrder } = await import("../mutations");

const request: ApiCheckoutRequest = {
  phone: "01712345678",
  first_name: "Rahim",
  items: [{ variant_id: "v-1", quantity: 2 }],
  shipping_address: { line1: "House 1", city: "Dhaka" },
  payment_method: "cod",
};

beforeEach(() => {
  apiRequest.mockReset();
});

describe("placeOrder", () => {
  it("sends the item list when there is no saved cart", async () => {
    apiRequest.mockResolvedValueOnce({ id: "o-1" });
    await placeOrder(request);
    expect(apiRequest).toHaveBeenCalledWith("/checkout/", { method: "POST", body: request, headers: {} });
  });

  it("sends a logged-in customer's token so the order lands on their account", async () => {
    apiRequest.mockResolvedValueOnce({ id: "o-1" });
    await placeOrder(request, null, { Authorization: "Bearer abc" });
    expect(apiRequest).toHaveBeenCalledWith("/checkout/", {
      method: "POST",
      body: request,
      headers: { Authorization: "Bearer abc" },
    });
  });

  it("sends the token together with the saved cart's token", async () => {
    apiRequest.mockResolvedValueOnce({ id: "o-1" });
    await placeOrder(request, "tok", { Authorization: "Bearer abc" });
    expect(apiRequest.mock.calls[0][1].headers).toEqual({
      Authorization: "Bearer abc",
      "X-Guest-Cart-Token": "tok",
    });
  });

  it("checks out the saved cart by token, without the item list", async () => {
    apiRequest.mockResolvedValueOnce({ id: "o-1" });
    await placeOrder(request, "tok");

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const options = apiRequest.mock.calls[0][1];
    expect(options.headers).toEqual({ "X-Guest-Cart-Token": "tok" });
    expect(JSON.parse(JSON.stringify(options.body))).not.toHaveProperty("items");
  });

  it("falls back to the item list when the saved cart is gone", async () => {
    apiRequest
      .mockRejectedValueOnce(new ApiError({ status: 404, code: "guest_cart_not_found", message: "Cart not found." }))
      .mockResolvedValueOnce({ id: "o-1" });
    await placeOrder(request, "tok");
    expect(apiRequest).toHaveBeenLastCalledWith("/checkout/", { method: "POST", body: request, headers: {} });
  });

  it("does not retry any other failure, so an order is never placed twice", async () => {
    apiRequest.mockRejectedValueOnce(
      new ApiError({ status: 0, code: "network_error", message: "timeout", isNetwork: true }),
    );
    await expect(placeOrder(request, "tok")).rejects.toMatchObject({ code: "network_error" });
    expect(apiRequest).toHaveBeenCalledTimes(1);
  });
});
