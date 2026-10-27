import { afterEach, describe, expect, it, vi } from "vitest";

const env: { IMAGES?: unknown } = {};
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => ({ env }) }));

import { ogCardResponse } from "../og-card";

function binding(output: () => Promise<{ response(): Response }>) {
  const transform = vi.fn(() => ({ output }));
  return { images: { input: vi.fn(() => ({ transform })) }, transform };
}

function photoResponse(init: ResponseInit = {}, body: BodyInit | null = "bytes") {
  return new Response(body, { status: 200, headers: { "Content-Type": "image/webp" }, ...init });
}

afterEach(() => {
  env.IMAGES = undefined;
  vi.restoreAllMocks();
});

describe("ogCardResponse", () => {
  it("answers 503 when the image service is not bound", async () => {
    const res = await ogCardResponse("https://api.example.com/p.webp");
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 502, uncached, when the photo cannot be fetched", async () => {
    env.IMAGES = binding(async () => ({ response: () => new Response("x") })).images;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(photoResponse({ status: 404 }));
    const res = await ogCardResponse("https://api.example.com/p.webp");
    expect(res.status).toBe(502);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 502 when the image service rejects the photo", async () => {
    env.IMAGES = binding(async () => Promise.reject(new Error("bad image"))).images;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(photoResponse());
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await ogCardResponse("https://api.example.com/p.webp")).status).toBe(502);
  });

  it("pads the photo onto a 1200x630 canvas and caches the result", async () => {
    const { images, transform } = binding(async () => ({ response: () => new Response("jpeg") }));
    env.IMAGES = images;
    vi.spyOn(globalThis, "fetch").mockResolvedValue(photoResponse());
    const res = await ogCardResponse("https://api.example.com/p.webp");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("max-age=3600");
    expect(transform).toHaveBeenCalledWith(expect.objectContaining({ width: 1200, height: 630, fit: "pad" }));
  });
});
