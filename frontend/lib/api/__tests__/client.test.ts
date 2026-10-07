import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://api.test/api/v1/public");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function client() {
  return import("../client");
}

describe("apiRequest", () => {
  it("unwraps the { data } envelope and calls the configured base URL", async () => {
    fetchMock.mockResolvedValue(json({ data: [{ id: 1 }], message: "" }));
    const { apiRequest } = await client();
    await expect(apiRequest("/catalog/categories/")).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock.mock.calls[0]![0]).toBe("http://api.test/api/v1/public/catalog/categories/");
  });

  it("drops empty query values", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ data: {}, message: "" })));
    const { apiRequest } = await client();
    await apiRequest("/x/", { query: { a: 1, b: "", c: undefined, d: null, e: false } });
    expect(fetchMock.mock.calls[0]![0]).toBe("http://api.test/api/v1/public/x/?a=1&e=false");
  });

  it("caches GETs that opt in and never caches the rest", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json({ data: {}, message: "" })));
    const { apiRequest } = await client();
    await apiRequest("/a/", { revalidate: 60, tags: ["catalog"] });
    await apiRequest("/b/");
    await apiRequest("/c/", { method: "POST", body: { x: 1 }, revalidate: 60 });
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ next: { revalidate: 60, tags: ["catalog"] } });
    expect(fetchMock.mock.calls[1]![1]).toMatchObject({ cache: "no-store" });
    expect(fetchMock.mock.calls[2]![1]).toMatchObject({ cache: "no-store", method: "POST", body: '{"x":1}' });
  });

  it("normalises an error body, flattening nested field errors", async () => {
    fetchMock.mockResolvedValue(
      json(
        {
          error: {
            code: "validation_error",
            message: "Invalid",
            fields: { email: ["Enter a valid email."], shipping_address: { postal_code: ["Required."] } },
          },
        },
        400,
      ),
    );
    const { apiRequest, ApiError } = await client();
    const error = await apiRequest("/checkout/", { method: "POST", body: {} }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "validation_error",
      isNetwork: false,
      fields: { email: "Enter a valid email.", "shipping_address.postal_code": "Required." },
    });
  });

  it("reports a 404 as isNotFound and falls back to http_<status> for non-JSON errors", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: "not_found", message: "No" } }, 404));
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    const { apiRequest } = await client();
    await expect(apiRequest("/p/")).rejects.toMatchObject({ isNotFound: true, status: 404 });
    await expect(apiRequest("/p/")).rejects.toMatchObject({ code: "http_502", status: 502 });
  });

  it("turns a network failure into a network ApiError", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const { apiRequest } = await client();
    await expect(apiRequest("/p/")).rejects.toMatchObject({ isNetwork: true, code: "network_error", status: 0 });
  });

  it("rejects a success response without a data envelope", async () => {
    fetchMock.mockResolvedValue(json({ nope: true }));
    const { apiRequest } = await client();
    await expect(apiRequest("/p/")).rejects.toMatchObject({ code: "bad_response" });
  });

  it("fails clearly on the server when the API URL is not configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "");
    const { apiRequest } = await client();
    await expect(apiRequest("/p/")).rejects.toMatchObject({ code: "api_not_configured", isNetwork: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("fetchAllPages", () => {
  it("walks every page until there is no next link", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ data: { results: [1, 2], count: 3, next: "more", previous: null }, message: "" }))
      .mockResolvedValueOnce(json({ data: { results: [3], count: 3, next: null, previous: "x" }, message: "" }));
    const { fetchAllPages } = await client();
    await expect(fetchAllPages<number>("/catalog/products/")).resolves.toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls[0]![0]).toContain("page=1&page_size=100");
    expect(fetchMock.mock.calls[1]![0]).toContain("page=2&page_size=100");
  });

  it("requests the pages after the first together, sized by what the first page returned", async () => {
    const page = (results: number[], next: string | null) =>
      json({ data: { results, count: 5, next, previous: null }, message: "" });
    fetchMock.mockImplementation(async (url: string) => {
      const n = Number(new URL(url, "http://x").searchParams.get("page"));
      return page(n === 1 ? [1, 2] : n === 2 ? [3, 4] : [5], n < 3 ? "more" : null);
    });
    const { fetchAllPages } = await client();
    await expect(fetchAllPages<number>("/catalog/products/")).resolves.toEqual([1, 2, 3, 4, 5]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("apiRequest on a Worker", () => {
  function stubEdgeCache() {
    const store = new Map<string, string>();
    vi.stubGlobal("caches", {
      default: {
        match: async (key: string) => (store.has(key) ? new Response(store.get(key)) : undefined),
        put: async (key: string, value: Response) => void store.set(key, await value.text()),
      },
    });
    return store;
  }

  it("answers a repeated cacheable GET from the edge cache", async () => {
    stubEdgeCache();
    fetchMock.mockImplementation(async () => json({ data: [{ id: 1 }], message: "" }));
    const { apiRequest } = await client();
    await expect(apiRequest("/catalog/categories/", { revalidate: 60 })).resolves.toEqual([{ id: 1 }]);
    await expect(apiRequest("/catalog/categories/", { revalidate: 60 })).resolves.toEqual([{ id: 1 }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not store failures, uncached requests or requests with caller headers", async () => {
    const store = stubEdgeCache();
    const { apiRequest } = await client();
    fetchMock.mockImplementation(async () => json({ error: { code: "boom", message: "x" } }, 500));
    await expect(apiRequest("/catalog/categories/", { revalidate: 60 })).rejects.toThrow();
    fetchMock.mockImplementation(async () => json({ data: 1, message: "" }));
    await apiRequest("/cart/");
    await apiRequest("/cart/", { revalidate: 60, headers: { "X-Cart-Token": "t" } });
    expect(store.size).toBe(0);
  });
});
