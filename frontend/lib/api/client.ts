import { publicEnv } from "@/lib/env";
import type { ApiEnvelope, ApiErrorBody, ApiPage } from "@/lib/api/types";

/**
 * Base URL of the LaunchCart public API.
 *  - Server (RSC, route handlers, build): the real backend URL from NEXT_PUBLIC_API_URL (see next.config.mjs).
 *  - Browser: the same-origin /api/public proxy, so there is no CORS and the CSP stays `connect-src 'self'`.
 */
const SERVER_BASE = publicEnv.apiUrl ?? "";
const BROWSER_BASE = "/api/public";

/** Failure of an API call, already normalised from the backend's { error: { code, message, fields } } body. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /** First message per field, keyed by the API field name (e.g. "email", "shipping_address.postal_code"). */
  readonly fields: Record<string, string>;
  /** True when the request never got an answer (backend down, offline, timeout). */
  readonly isNetwork: boolean;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    fields?: Record<string, string>;
    isNetwork?: boolean;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.fields = init.fields ?? {};
    this.isNetwork = init.isNetwork ?? false;
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }
}

/** Nested serializer errors arrive as objects (shipping_address: { postal_code: [...] }); flatten to dotted keys. */
function flattenFields(input: unknown, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (!input || typeof input !== "object") return out;
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else if (Array.isArray(value)) {
      const first = value.find((v) => typeof v === "string");
      if (typeof first === "string") out[path] = first;
      else value.forEach((item, i) => flattenFields(item, `${path}.${i}`, out));
    } else if (value && typeof value === "object") {
      flattenFields(value, path, out);
    }
  }
  return out;
}

export interface RequestOptions {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** Server-side cache lifetime in seconds for GETs (ignored in the browser). Omit for no caching. */
  revalidate?: number;
  tags?: string[];
  signal?: AbortSignal;
  /** Abort after this many ms so a dead backend cannot hang a page render or a build. Default 10s. */
  timeoutMs?: number;
}

function buildUrl(path: string, query: RequestOptions["query"]): string {
  const isBrowser = typeof window !== "undefined";
  // Django routes end in "/". The proxy adds it back, and Next would 308-redirect a slash-terminated
  // browser URL, so the browser omits it.
  const cleanPath = isBrowser ? path.replace(/\/+$/, "") : path;
  let url = `${isBrowser ? BROWSER_BASE : SERVER_BASE}${cleanPath}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  if (qs) url += `?${qs}`;
  return url;
}

/**
 * One request to the public API. Resolves with the envelope's `data` on success, throws ApiError otherwise.
 * `path` is relative to /api/v1/public and keeps its trailing slash, exactly as in the OpenAPI document.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, revalidate, tags, signal, timeoutMs = 10_000 } = options;

  if (typeof window === "undefined" && !SERVER_BASE) {
    throw new ApiError({
      status: 0,
      code: "api_not_configured",
      message: "NEXT_PUBLIC_API_URL is not set.",
      isNetwork: true,
    });
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const cacheable = method === "GET" && revalidate !== undefined;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: combined,
      // `next` is a Next.js extension of fetch (server only); the browser ignores it.
      ...(cacheable ? { next: { revalidate, tags } } : { cache: "no-store" as const }),
    });
  } catch (cause) {
    throw new ApiError({
      status: 0,
      code: "network_error",
      message: cause instanceof Error ? cause.message : "Network error",
      isNetwork: true,
    });
  }

  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Non-JSON body (proxy error page, 5xx HTML): handled below.
  }

  if (!response.ok) {
    const err = (json as ApiErrorBody | null)?.error;
    throw new ApiError({
      status: response.status,
      code: err?.code ?? `http_${response.status}`,
      message: err?.message ?? (response.statusText || "Request failed"),
      fields: flattenFields(err?.fields),
    });
  }

  if (!json || typeof json !== "object" || !("data" in json)) {
    throw new ApiError({ status: response.status, code: "bad_response", message: "Unexpected response from the API." });
  }
  return (json as ApiEnvelope<T>).data;
}

const MAX_PAGE_SIZE = 100;
/** Safety stop so a misbehaving `next` link can never loop forever. */
const MAX_PAGES = 50;

/**
 * Walks every page of a paginated list endpoint (page_size 100, the API maximum) and concatenates the results.
 * Keeps the storefront correct beyond the first page without assuming a catalogue size.
 */
export async function fetchAllPages<T>(
  path: string,
  options: Omit<RequestOptions, "method" | "body"> = {},
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const data = await apiRequest<ApiPage<T>>(path, {
      ...options,
      query: { ...options.query, page, page_size: MAX_PAGE_SIZE },
    });
    all.push(...data.results);
    if (!data.next) break;
  }
  return all;
}
