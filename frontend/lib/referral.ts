export const REF_PARAM = "ref";
export const REF_STORAGE_KEY = "kullmart:ref";
export const REF_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const CODE_PATTERN = /^[A-Za-z0-9]{4,32}$/;

export type RefStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStorage = (): RefStorage | null => {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
};

/** The referral code in a query string ("?ref=ab12cd3"), upper-cased, or null when absent or malformed. */
export function parseRefParam(search: string): string | null {
  const raw = new URLSearchParams(search).get(REF_PARAM)?.trim() ?? "";
  return CODE_PATTERN.test(raw) ? raw.toUpperCase() : null;
}

/** Keeps the code for 30 days; a newer link replaces an older one. Returns the stored code, or null. */
export function captureRef(
  search: string,
  now = Date.now(),
  storage: RefStorage | null = browserStorage(),
): string | null {
  const code = parseRefParam(search);
  if (!code || !storage) return null;
  try {
    storage.setItem(REF_STORAGE_KEY, JSON.stringify({ code, expiresAt: now + REF_TTL_MS }));
    return code;
  } catch {
    return null;
  }
}

export function readStoredRef(now = Date.now(), storage: RefStorage | null = browserStorage()): string | null {
  if (!storage) return null;
  try {
    const saved = storage.getItem(REF_STORAGE_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    const { code, expiresAt } = (parsed ?? {}) as { code?: unknown; expiresAt?: unknown };
    if (typeof code === "string" && CODE_PATTERN.test(code) && typeof expiresAt === "number" && expiresAt > now) {
      return code;
    }
    storage.removeItem(REF_STORAGE_KEY);
  } catch {
    return null;
  }
  return null;
}

export function clearStoredRef(storage: RefStorage | null = browserStorage()): void {
  try {
    storage?.removeItem(REF_STORAGE_KEY);
  } catch {
    // Blocked storage: nothing was kept, so nothing to clear.
  }
}

export const referralLink = (origin: string, code: string): string =>
  `${origin.replace(/\/+$/, "")}/?${REF_PARAM}=${encodeURIComponent(code)}`;
