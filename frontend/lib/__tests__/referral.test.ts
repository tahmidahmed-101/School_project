import { describe, expect, it } from "vitest";
import {
  REF_STORAGE_KEY,
  REF_TTL_MS,
  captureRef,
  clearStoredRef,
  parseRefParam,
  readStoredRef,
  referralLink,
  type RefStorage,
} from "../referral";

const memoryStorage = (): RefStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
};

const blockedStorage: RefStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const NOW = 1_700_000_000_000;

describe("parseRefParam", () => {
  it("reads and upper-cases the code", () => {
    expect(parseRefParam("?ref=k7m2x9a")).toBe("K7M2X9A");
    expect(parseRefParam("?utm=1&ref=K7M2X9A")).toBe("K7M2X9A");
  });

  it("ignores a missing, short or malformed code", () => {
    expect(parseRefParam("")).toBeNull();
    expect(parseRefParam("?ref=")).toBeNull();
    expect(parseRefParam("?ref=ab")).toBeNull();
    expect(parseRefParam("?ref=<script>")).toBeNull();
    expect(parseRefParam("?ref=" + "A".repeat(33))).toBeNull();
  });
});

describe("captureRef and readStoredRef", () => {
  it("keeps the code for 30 days", () => {
    const storage = memoryStorage();
    expect(captureRef("?ref=K7M2X9A", NOW, storage)).toBe("K7M2X9A");

    expect(readStoredRef(NOW + REF_TTL_MS - 1, storage)).toBe("K7M2X9A");
    expect(readStoredRef(NOW + REF_TTL_MS, storage)).toBeNull();
    expect(storage.data.has(REF_STORAGE_KEY)).toBe(false);
  });

  it("lets a newer link replace the older code", () => {
    const storage = memoryStorage();
    captureRef("?ref=FIRST111", NOW, storage);
    captureRef("?ref=SECOND22", NOW + 1000, storage);

    expect(readStoredRef(NOW + 2000, storage)).toBe("SECOND22");
  });

  it("stores nothing for a page without a valid ref", () => {
    const storage = memoryStorage();
    expect(captureRef("?page=2", NOW, storage)).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it("drops a corrupt saved value", () => {
    const storage = memoryStorage();
    storage.setItem(REF_STORAGE_KEY, "not json");
    expect(readStoredRef(NOW, storage)).toBeNull();

    storage.setItem(REF_STORAGE_KEY, JSON.stringify({ code: "K7M2X9A" }));
    expect(readStoredRef(NOW, storage)).toBeNull();
  });

  it("does not throw when storage is blocked or missing", () => {
    expect(captureRef("?ref=K7M2X9A", NOW, blockedStorage)).toBeNull();
    expect(readStoredRef(NOW, blockedStorage)).toBeNull();
    expect(() => clearStoredRef(blockedStorage)).not.toThrow();
    expect(captureRef("?ref=K7M2X9A", NOW, null)).toBeNull();
    expect(readStoredRef(NOW, null)).toBeNull();
  });
});

describe("clearStoredRef", () => {
  it("removes the saved code", () => {
    const storage = memoryStorage();
    captureRef("?ref=K7M2X9A", NOW, storage);
    clearStoredRef(storage);
    expect(readStoredRef(NOW, storage)).toBeNull();
  });
});

describe("referralLink", () => {
  it("puts the code on the storefront home", () => {
    expect(referralLink("https://kullmart.com/", "K7M2X9A")).toBe("https://kullmart.com/?ref=K7M2X9A");
  });
});
