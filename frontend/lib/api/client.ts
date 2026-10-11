import { publicEnv } from "@/lib/env";
import { readEdgeCache, writeEdgeCache } from "@/lib/api/edge-cache";
import type { ApiEnvelope, ApiErrorBody, ApiPage } from "@/lib/api/types";

/**
 * Base URL of the LaunchCart public API.
 *  - Server (RSC, route handlers, build): the real backend URL from NEXT_PUBLIC_API_URL (see next.config.mjs).
 *  - Browser: the same-origin /api/public proxy, so there is no CORS and the CSP stays `connect-src 'self'`.
 */
const SERVER_BASE = publicEnv.apiUrl ?? "";
const BROWSER_BASE = "/api/public";
/** Customer (account) API: browser only, through the same-origin proxy in next.config.mjs. */
const CUSTOMER_BROWSER_BASE = "/api/v1/customer";

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
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /** "customer" targets /api/v1/customer (accounts, questions, price reports) instead of the public API. */
  scope?: "public" | "customer";
  /** Extra request headers (e.g. the guest cart token). */
  headers?: Record<string, string>;
  /** Server-side cache lifetime in seconds for GETs (ignored in the browser). Omit for no caching. */
  revalidate?: number;
  tags?: string[];
  signal?: AbortSignal;
  /** Abort after this many ms so a dead backend cannot hang a page render or a build. Default 10s. */
  timeoutMs?: number;
}

function buildUrl(path: string, query: RequestOptions["query"], scope: RequestOptions["scope"]): string {
  const isBrowser = typeof window !== "undefined";
  const browserBase = scope === "customer" ? CUSTOMER_BROWSER_BASE : BROWSER_BASE;
  // Django routes end in "/". The proxy adds it back, and Next would 308-redirect a slash-terminated
  // browser URL, so the browser omits it.
  const cleanPath = isBrowser ? path.replace(/\/+$/, "") : path;
  let url = `${isBrowser ? browserBase : SERVER_BASE}${cleanPath}`;
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
 * `path` is relative to /api/v1/public (or /api/v1/customer with `scope: "customer"`) and keeps its trailing
 * slash, exactly as in the OpenAPI document.
 */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", query, body, headers, revalidate, tags, signal, timeoutMs = 10_000, scope } = options;

  if (typeof window === "undefined" && scope === "customer") {
    throw new ApiError({ status: 0, code: "browser_only", message: "The customer API is called from the browser." });
  }
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
  const url = buildUrl(path, query, scope);
  // Answers that depend on a caller's headers (a cart token) are never shared.
  const shared = cacheable && typeof window === "undefined" && !headers;

  const stored = shared ? await readEdgeCache(url) : null;
  let response: Response;
  try {
    response =
      stored ??
      (await fetch(url, {
        method,
        headers: {
          Accept: "application/json",
          // A FormData body (file uploads) sets its own multipart Content-Type, boundary included.
          ...(body !== undefined && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
          // Names this app to the account API, which keeps a separate refresh cookie per app: a storefront login
          // never replaces or ends a dashboard session in the same browser. It only selects the cookie.
          ...(scope === "customer" ? { "X-Auth-Client": "storefront" } : {}),
          ...headers,
        },
        body: body === undefined || body instanceof FormData ? body : JSON.stringify(body),
        signal: combined,
        // `next` is a Next.js extension of fetch (server only); the browser ignores it.
        ...(cacheable ? { next: { revalidate, tags } } : { cache: "no-store" as const }),
      }));
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
    const text = await response.text();
    json = JSON.parse(text);
    if (shared && !stored && response.ok) await writeEdgeCache(url, text, revalidate);
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

  // 204 (logout, deletes) has no envelope.
  if (response.status === 204) return undefined as T;

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
  const pageOf = (page: number) =>
    apiRequest<ApiPage<T>>(path, { ...options, query: { ...options.query, page, page_size: MAX_PAGE_SIZE } });

  const first = await pageOf(1);
  if (!first.next || first.results.length === 0) return first.results;
  // The first page says how many rows there are, so the rest are requested together rather than one after another.
  const pageCount = Math.min(MAX_PAGES, Math.ceil(first.count / first.results.length));
  const rest = await Promise.all(Array.from({ length: pageCount - 1 }, (_, i) => pageOf(i + 2)));
  return [first, ...rest].flatMap((page) => page.results);
}
