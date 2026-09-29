import { afterEach, describe, expect, it, vi } from "vitest";

/** env.ts reads process.env once at import, so each case stubs the variables and re-imports the module. */
async function load(vars: Record<string, string>) {
  vi.resetModules();
  for (const key of [
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_GA_ID",
    "NEXT_PUBLIC_FB_PIXEL_ID",
    "NEXT_PUBLIC_TIKTOK_PIXEL_ID",
  ]) {
    vi.stubEnv(key, vars[key] ?? "");
  }
  return (await import("../env")).publicEnv;
}

afterEach(() => vi.unstubAllEnvs());

describe("publicEnv", () => {
  it("treats unset or blank values as undefined", async () => {
    const env = await load({});
    expect(env.siteUrl).toBeUndefined();
    expect(env.apiUrl).toBeUndefined();
    expect(env.gaId).toBeUndefined();
  });

  it("reduces the site URL to its origin", async () => {
    const env = await load({ NEXT_PUBLIC_SITE_URL: "https://kullmart.com/some/path/" });
    expect(env.siteUrl).toBe("https://kullmart.com");
  });

  it("strips trailing slashes from the API URL but keeps its path", async () => {
    const env = await load({ NEXT_PUBLIC_API_URL: "http://127.0.0.1:8000/api/v1/public//" });
    expect(env.apiUrl).toBe("http://127.0.0.1:8000/api/v1/public");
  });

  it("names the variable when a URL is malformed", async () => {
    await expect(load({ NEXT_PUBLIC_SITE_URL: "not a url" })).rejects.toThrow(/NEXT_PUBLIC_SITE_URL/);
    await expect(load({ NEXT_PUBLIC_API_URL: "nope" })).rejects.toThrow(/NEXT_PUBLIC_API_URL/);
  });

  it("validates the tracking IDs", async () => {
    const ok = await load({
      NEXT_PUBLIC_GA_ID: "G-ABC123",
      NEXT_PUBLIC_FB_PIXEL_ID: "123456789",
      NEXT_PUBLIC_TIKTOK_PIXEL_ID: "C9ABCDEF12",
    });
    expect(ok.gaId).toBe("G-ABC123");
    await expect(load({ NEXT_PUBLIC_GA_ID: "UA-1" })).rejects.toThrow(/NEXT_PUBLIC_GA_ID/);
    await expect(load({ NEXT_PUBLIC_FB_PIXEL_ID: "abc" })).rejects.toThrow(/NEXT_PUBLIC_FB_PIXEL_ID/);
  });
});
